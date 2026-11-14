import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { db } from "../lib/db";
import { provisionOrganization } from "../lib/bootstrap";
import { smtpStatus, checkSmtp } from "../lib/services/integrations";
import { smtpConfiguration } from "../lib/smtp";
import type { Actor } from "../lib/security";

vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn() } }));
const verify = vi.fn();
const close = vi.fn();
let owner: Actor;
beforeAll(() => {
  if (new URL(process.env.DATABASE_URL!).pathname !== "/wintron_test")
    throw new Error("Isolated database required");
});
beforeEach(async () => {
  const org = await provisionOrganization("SMTP test " + randomUUID());
  owner = {
    organizationId: org.id,
    userId: "smtp-test",
    name: "Test owner",
    role: "OWNER",
  };
  for (const [key, value] of Object.entries({
    SMTP_HOST: "smtp.example.invalid",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_FROM: "Wintron Test <sender@example.invalid>",
    SMTP_USER: "test-user",
    SMTP_PASSWORD: "private-test-password",
  }))
    vi.stubEnv(key, value);
  verify.mockReset().mockResolvedValue(true);
  close.mockReset();
  vi.mocked(nodemailer.createTransport)
    .mockReset()
    .mockReturnValue({ verify, close } as never);
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => db.$disconnect());

describe.sequential("honest integration status and SMTP diagnostics", () => {
  it("distinguishes missing setup from present but unverified credentials", async () => {
    expect((await smtpStatus(owner)).state).toBe("VERIFICATION_REQUIRED");
    vi.stubEnv("SMTP_HOST", "");
    const result = await smtpStatus(owner);
    expect(result.state).toBe("SETUP_REQUIRED");
    expect(result.issues).toContain("Set SMTP_HOST.");
    await expect(checkSmtp(owner)).rejects.toMatchObject({ status: 409 });
    expect(verify).not.toHaveBeenCalled();
  });
  it("validates sender, port, TLS setting and complete credential pairs", () => {
    expect(
      smtpConfiguration({
        SMTP_HOST: "smtp.example.invalid",
        SMTP_FROM: "sender@example.invalid",
        SMTP_SECURE: "true",
      }),
    ).toMatchObject({ configured: true, port: 465 });
    const result = smtpConfiguration({
      SMTP_HOST: "https://invalid.example",
      SMTP_FROM: "bad\r\nBcc: stolen@example.invalid",
      SMTP_PORT: "NaN",
      SMTP_SECURE: "yes",
      SMTP_USER: "lonely",
    });
    expect(result.configured).toBe(false);
    expect(result.issues).toHaveLength(5);
  });
  it("records verification without sending messages or exposing credentials", async () => {
    const result = await checkSmtp(owner);
    expect(result.state).toBe("CONNECTION_VERIFIED");
    expect(result.checkedAt).toBeTruthy();
    expect(result.lastAcceptedAt).toBeNull();
    expect(result.detail).toContain("recipient delivery is not verified");
    expect(verify).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        requireTLS: true,
        secure: false,
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
    const events = await db.auditEvent.findMany({
      where: { organizationId: owner.organizationId },
    });
    expect(events.map((event) => event.action)).toContain("CHECK_PASSED");
    const exposed = JSON.stringify([result, events]);
    for (const value of [
      "private-test-password",
      "test-user",
      "smtp.example.invalid",
    ])
      expect(exposed).not.toContain(value);
    expect((await smtpStatus(owner)).state).toBe("CONNECTION_VERIFIED");
  });
  it("invalidates successful checks when configuration changes or becomes stale", async () => {
    await checkSmtp(owner);
    vi.stubEnv("SMTP_PASSWORD", "replacement-secret");
    expect((await smtpStatus(owner)).state).toBe("VERIFICATION_REQUIRED");
    vi.stubEnv("SMTP_PASSWORD", "private-test-password");
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 90000000);
    try {
      expect((await smtpStatus(owner)).state).toBe("VERIFICATION_REQUIRED");
    } finally {
      clock.mockRestore();
    }
  });
  it("persists a sanitized failure and always closes the transport", async () => {
    verify.mockRejectedValue(
      new Error("password=private-test-password provider diagnostic"),
    );
    const result = await checkSmtp(owner);
    expect(result.state).toBe("ERROR");
    expect(close).toHaveBeenCalledOnce();
    expect((await smtpStatus(owner)).state).toBe("ERROR");
    const events = await db.auditEvent.findMany({
      where: { organizationId: owner.organizationId },
    });
    expect(JSON.stringify([result, events])).not.toContain(
      "private-test-password",
    );
  });
  it("allows only owners to inspect or test the connection", async () => {
    for (const role of ["STAFF", "ACCOUNTANT"] as const) {
      await expect(smtpStatus({ ...owner, role })).rejects.toMatchObject({
        status: 403,
      });
      await expect(checkSmtp({ ...owner, role })).rejects.toMatchObject({
        status: 403,
      });
    }
    expect(verify).not.toHaveBeenCalled();
  });
  it("scopes connection evidence to the organization", async () => {
    await checkSmtp(owner);
    const other = await provisionOrganization(
      "Other SMTP test " + randomUUID(),
    );
    expect(
      (await smtpStatus({ ...owner, organizationId: other.id })).state,
    ).toBe("VERIFICATION_REQUIRED");
  });
  it("rejects concurrent and repeated checks across requests", async () => {
    const results = await Promise.allSettled([
      checkSmtp(owner),
      checkSmtp(owner),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failure = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(failure.reason.status).toBe(429);
    expect(verify).toHaveBeenCalledOnce();
    await expect(checkSmtp(owner)).rejects.toMatchObject({ status: 429 });
  });
});
