import { createHmac } from "node:crypto";
import { db } from "../db";
import { authorize, AppError, type Actor } from "../security";
import { createSmtpTransport, smtpConfiguration } from "../smtp";
import type { SmtpStatus } from "../integration-types";
import { audit, transaction } from "./ledger";

function configHash(config: ReturnType<typeof smtpConfiguration>) {
  // A keyed fingerprint invalidates old checks when credentials change without storing them.
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret)
    throw new AppError(
      "Application authentication secret is not configured.",
      503,
    );
  return createHmac("sha256", secret)
    .update(JSON.stringify(config))
    .digest("hex");
}
const scope = (a: Actor) => ({
  organizationId: a.organizationId,
  entityType: "INTEGRATION",
  entityId: "smtp",
});

export async function smtpStatus(a: Actor): Promise<SmtpStatus> {
  authorize(a, "owner");
  const config = smtpConfiguration();
  const [check, delivery] = await Promise.all([
    db.auditEvent.findFirst({
      where: scope(a),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    // Manual delivery records are not proof of SMTP acceptance.
    db.auditEvent.findFirst({
      where: {
        organizationId: a.organizationId,
        action: "SENT",
        entityType: "INVOICE",
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  const base = {
    configured: config.configured,
    issues: config.issues,
    checkedAt: null,
    lastAcceptedAt: delivery?.createdAt.toISOString() || null,
  };
  if (!config.configured)
    return {
      ...base,
      state: "SETUP_REQUIRED",
      detail:
        "Invoice email is implemented. Complete the server configuration to enable sending.",
    };
  const metadata = check?.after as { configHash?: string } | null;
  if (!check || metadata?.configHash !== configHash(config))
    return {
      ...base,
      state: "VERIFICATION_REQUIRED",
      detail:
        "Configuration is present. Check the connection before sending an invoice.",
    };
  const age = Date.now() - check.createdAt.getTime();
  if (check.action === "CHECK_STARTED")
    return {
      ...base,
      state: age < 60000 ? "CHECKING" : "VERIFICATION_REQUIRED",
      detail:
        age < 60000
          ? "Connection check in progress. No email is sent."
          : "The previous check did not finish. Run the connection check again.",
    };
  const checkedAt = check.createdAt.toISOString();
  if (age > 86400000)
    return {
      ...base,
      checkedAt,
      state: "VERIFICATION_REQUIRED",
      detail:
        "The last check is over 24 hours old. Check the connection again.",
    };
  return {
    ...base,
    checkedAt,
    state: check.action === "CHECK_PASSED" ? "CONNECTION_VERIFIED" : "ERROR",
    detail: check.summary,
  };
}

export async function checkSmtp(a: Actor): Promise<SmtpStatus> {
  authorize(a, "owner");
  const config = smtpConfiguration();
  if (!config.configured)
    throw new AppError(
      "Invoice email setup required. " + config.issues.join(" "),
      409,
    );
  const fingerprint = configHash(config);
  await transaction(async (tx) => {
    // Serialize attempts across processes; a double-click cannot create concurrent checks.
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${a.organizationId} FOR UPDATE`;
    const previous = await tx.auditEvent.findFirst({
      where: { ...scope(a), action: "CHECK_STARTED" },
      orderBy: { createdAt: "desc" },
    });
    if (previous && Date.now() - previous.createdAt.getTime() < 60000)
      throw new AppError(
        "Wait one minute before checking the connection again.",
        429,
      );
    await audit(
      tx,
      a,
      "CHECK_STARTED",
      "INTEGRATION",
      "smtp",
      "Invoice email connection check started. No email sent.",
      undefined,
      undefined,
      { configHash: fingerprint },
    );
  });
  const transport = createSmtpTransport(config);
  let passed = false;
  try {
    await transport.verify();
    passed = true;
  } catch {
    // Provider errors can contain credentials and host details. Never return or persist them.
  } finally {
    transport.close();
  }
  await transaction((tx) =>
    audit(
      tx,
      a,
      passed ? "CHECK_PASSED" : "CHECK_FAILED",
      "INTEGRATION",
      "smtp",
      passed
        ? "SMTP connection, TLS, and configured authentication verified. No email sent; recipient delivery is not verified."
        : "Connection check failed. Review the SMTP host, port, TLS settings, and credentials, then retry.",
      undefined,
      undefined,
      { configHash: fingerprint },
    ),
  );
  return smtpStatus(a);
}
