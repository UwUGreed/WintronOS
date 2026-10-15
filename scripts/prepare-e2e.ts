import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
async function setup() {
  process.loadEnvFile(".env");
  if (existsSync(".data/e2e-owner-session.json"))
    unlinkSync(".data/e2e-owner-session.json");
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = "/wintron_test";
  process.env.DATABASE_URL = url.toString();
  const { provisionOrganization, provisionUser } =
    await import("../lib/bootstrap");
  const { db } = await import("../lib/db");
  // A previous run intentionally exhausts limits; reset only this isolated test DB.
  if (new URL(process.env.DATABASE_URL!).pathname !== "/wintron_test")
    throw new Error("Test database required");
  await db.rateLimit.deleteMany();
  const org = await provisionOrganization("Wintron Technologies LLC");
  const password = randomUUID() + randomUUID();
  const email = `e2e-${randomUUID()}@example.invalid`;
  const accountantEmail = `accountant-${randomUUID()}@example.invalid`;
  const mfaEmail = `mfa-${randomUUID()}@example.invalid`;
  await provisionUser(org.id, "Example Owner", email, password);
  await provisionUser(
    org.id,
    "Example Accountant",
    accountantEmail,
    password,
    "ACCOUNTANT",
  );
  await provisionUser(org.id, "Example MFA User", mfaEmail, password, "STAFF");
  mkdirSync(".data", { recursive: true });
  writeFileSync(
    ".data/e2e-credentials.json",
    JSON.stringify({
      email,
      password,
      accountantEmail,
      mfaEmail,
      organizationId: org.id,
    }),
    { mode: 0o600 },
  );
  await db.$disconnect();
}

setup().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
