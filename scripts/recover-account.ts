import "./env";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../lib/db";
async function main() {
  const args = process.argv.slice(2);
  const value = (key: string) => args[args.indexOf(key) + 1];
  if (
    !args.includes("--identity-verified") ||
    !args.includes("--email") ||
    !args.includes("--incident")
  )
    throw new Error(
      "Usage: recover-account.ts --email USER --incident INCIDENT_ID --identity-verified [--reset-mfa]. Verify identity out of band first.",
    );
  if (!process.stdin.isTTY) throw new Error("Interactive terminal required.");
  const user = await db.user.findUnique({
    where: { email: value("--email").toLowerCase() },
    include: { memberships: true },
  });
  if (!user) throw new Error("Account not found.");
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  process.stdout.write("New password (hidden, 14+ characters): ");
  muted = true;
  const password = await rl.question("");
  muted = false;
  process.stdout.write("\n");
  rl.close();
  if (password.length < 14 || password.length > 128)
    throw new Error("Password must contain 14–128 characters.");
  const hashed = await hashPassword(password);
  await db.$transaction(async (tx) => {
    await tx.account.upsert({
      where: {
        providerId_accountId: { providerId: "credential", accountId: user.id },
      },
      create: {
        id: randomUUID(),
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hashed,
      },
      update: { password: hashed },
    });
    await tx.session.deleteMany({ where: { userId: user.id } });
    if (args.includes("--reset-mfa")) {
      await tx.twoFactor.deleteMany({ where: { userId: user.id } });
      await tx.user.update({
        where: { id: user.id },
        data: { twoFactorEnabled: false },
      });
    }
    for (const m of user.memberships)
      await tx.auditEvent.create({
        data: {
          organizationId: m.organizationId,
          actorId: "host-administrator",
          action: "ACCOUNT_RECOVERY",
          entityType: "USER",
          entityId: user.id,
          summary: `Controlled account recovery; incident ${value("--incident")}; MFA reset: ${args.includes("--reset-mfa")}`,
        },
      });
  });
  console.log(
    "Password reset and sessions revoked. MFA reenrollment is required if reset.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
