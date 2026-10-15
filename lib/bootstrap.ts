import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "./db";
import { initializeAccounts } from "./services/ledger";
import type { Role } from "@prisma/client";
export async function provisionOrganization(name = "Wintron Technologies LLC") {
  return db.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name } });
    await initializeAccounts(tx, org.id);
    return org;
  });
}
export async function provisionUser(
  organizationId: string,
  name: string,
  email: string,
  password: string,
  role: Role = "OWNER",
) {
  if (password.length < 14 || password.length > 128)
    throw new Error("Password must contain 14–128 characters.");
  const id = randomUUID();
  const hashed = await hashPassword(password);
  return db.user.create({
    data: {
      id,
      name,
      email: email.toLowerCase(),
      emailVerified: true,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: hashed,
        },
      },
      memberships: { create: { organizationId, role } },
    },
  });
}
