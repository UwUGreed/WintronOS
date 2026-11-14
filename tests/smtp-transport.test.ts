import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createServer, type TLSSocket } from "node:tls";
import { createServer as createTcpServer } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { db } from "../lib/db";
import { provisionOrganization } from "../lib/bootstrap";
import { createSmtpTransport } from "../lib/smtp";
import { checkSmtp, smtpStatus } from "../lib/services/integrations";
import { saveClient } from "../lib/services/operations";
import { saveInvoice, issueInvoice } from "../lib/services/invoices";
import { sendInvoice } from "../lib/services/documents";
import type { Actor } from "../lib/security";

// Real SMTP over loopback TLS. All addresses and messages are fictional;
// no external provider is contacted. The fixture CA is trusted only by this test.
const originalTransport = nodemailer.createTransport.bind(nodemailer);
let folder: string;
let certificate: Buffer;
const commands: string[] = [];
const messages: string[] = [];
const sockets = new Set<TLSSocket>();
let rejectAuth = false;
let server: ReturnType<typeof createServer>;
let port: number;
beforeAll(async () => {
  if (new URL(process.env.DATABASE_URL!).pathname !== "/wintron_test")
    throw new Error("Isolated database required");
  folder = mkdtempSync(join(tmpdir(), "wintron-smtp-"));
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(folder, "key.pem"),
      "-out",
      join(folder, "cert.pem"),
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-days",
      "1",
    ],
    { stdio: "ignore" },
  );
  certificate = readFileSync(join(folder, "cert.pem"));
  server = createServer(
    { key: readFileSync(join(folder, "key.pem")), cert: certificate },
    (socket) => {
      sockets.add(socket);
      socket.on("error", () => {});
      socket.on("close", () => sockets.delete(socket));
      socket.setEncoding("utf8");
      socket.write("220 localhost fictional SMTP fixture\r\n");
      let buffer = "";
      let collecting = false;
      let message = "";
      socket.on("data", (chunk) => {
        buffer += chunk;
        let split: number;
        while ((split = buffer.indexOf("\r\n")) >= 0) {
          const line = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          if (collecting) {
            if (line === ".") {
              messages.push(message);
              message = "";
              collecting = false;
              socket.write("250 accepted by test fixture\r\n");
            } else message += line + "\r\n";
            continue;
          }
          const command = line.split(" ")[0];
          commands.push(command);
          if (command === "EHLO")
            socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
          else if (command === "AUTH")
            socket.write(
              rejectAuth
                ? "535 Invalid fictional credentials\r\n"
                : "235 Authentication successful\r\n",
            );
          else if (command === "MAIL" || command === "RCPT")
            socket.write("250 OK\r\n");
          else if (command === "DATA") {
            collecting = true;
            socket.write("354 Send message\r\n");
          } else if (command === "QUIT") socket.end("221 Bye\r\n");
          else socket.write("500 Unsupported fixture command\r\n");
        }
      });
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rejectAuth = false;
});
afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  if (folder) rmSync(folder, { recursive: true, force: true });
  await db.$disconnect();
});
function configure() {
  for (const [key, value] of Object.entries({
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(port),
    SMTP_SECURE: "true",
    SMTP_FROM: "sender@example.invalid",
    SMTP_USER: "fixture",
    SMTP_PASSWORD: "fictional-password",
  }))
    vi.stubEnv(key, value);
  vi.spyOn(nodemailer, "createTransport").mockImplementation(((
    options: SMTPTransport.Options,
  ) =>
    originalTransport({
      ...options,
      tls: { ca: certificate },
    })) as typeof nodemailer.createTransport);
}

describe.sequential("SMTP connection and invoice delivery over TLS", () => {
  it("verifies without sending and records only actual SMTP sends as provider acceptance", async () => {
    configure();
    const org = await provisionOrganization("Local SMTP fixture");
    const owner: Actor = {
      organizationId: org.id,
      userId: "smtp-fixture",
      name: "Test owner",
      role: "OWNER",
    };
    const verified = await checkSmtp(owner);
    expect(verified.state).toBe("CONNECTION_VERIFIED");
    expect(commands).toContain("AUTH");
    expect(commands).not.toContain("MAIL");
    expect(messages).toHaveLength(0);
    const client = await saveClient(owner, {
      name: "Fictional SMTP recipient",
      email: "recipient@example.invalid",
    });
    const draft = await saveInvoice(owner, {
      clientId: client.id,
      description: "Fictional SMTP invoice",
      issueDate: "2026-11-12",
      dueDate: "2026-12-12",
      lines: [
        {
          description: "Fictional service",
          quantity: "1",
          unitPrice: "10",
          taxPercent: "0",
          discountPercent: "0",
        },
      ],
    });
    await issueInvoice(owner, draft.id);
    await db.invoiceDelivery.create({
      data: {
        invoiceId: draft.id,
        status: "SENT",
        recipient: client.email,
        actorId: owner.userId,
      },
    });
    expect((await smtpStatus(owner)).lastAcceptedAt).toBeNull();
    await sendInvoice(owner, draft.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("recipient@example.invalid");
    expect(messages[0]).toContain("Content-Type: application/pdf");
    expect((await smtpStatus(owner)).lastAcceptedAt).toBeTruthy();
  });
  it("rejects invalid authentication against the SMTP server", async () => {
    configure();
    rejectAuth = true;
    const transport = createSmtpTransport();
    try {
      await expect(transport.verify()).rejects.toMatchObject({ code: "EAUTH" });
    } finally {
      transport.close();
    }
  });
  it("refuses plaintext when STARTTLS is unavailable", async () => {
    const tcp = createTcpServer((socket) => {
      socket.write("220 localhost fictional SMTP fixture\r\n");
      socket.on("data", (data) =>
        socket.write(
          data.toString().startsWith("EHLO")
            ? "250 localhost\r\n"
            : "500 STARTTLS unavailable\r\n",
        ),
      );
    });
    await new Promise<void>((resolve) => tcp.listen(0, "127.0.0.1", resolve));
    vi.stubEnv("SMTP_HOST", "127.0.0.1");
    vi.stubEnv("SMTP_PORT", String((tcp.address() as { port: number }).port));
    vi.stubEnv("SMTP_FROM", "sender@example.invalid");
    vi.stubEnv("SMTP_SECURE", "false");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASSWORD", "");
    const transport = createSmtpTransport();
    try {
      await expect(transport.verify()).rejects.toMatchObject({ code: "ETLS" });
    } finally {
      transport.close();
      await new Promise<void>((resolve) => tcp.close(() => resolve()));
    }
  });
});
