import "./env";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { z } from "zod";
import { db } from "../lib/db";
import { provisionOrganization, provisionUser } from "../lib/bootstrap";
async function main() {
  const args = process.argv.slice(2);
  const value = (key: string) => args[args.indexOf(key) + 1];
  const email = z.email().parse(value("--email"));
  const name = z.string().min(1).parse(value("--name"));
  if (!process.stdin.isTTY)
    throw new Error(
      "Run in an interactive terminal. Password is requested securely, never via arguments.",
    );
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  process.stdout.write("New admin password (14+ characters; hidden): ");
  muted = true;
  const password = await rl.question("");
  muted = false;
  process.stdout.write("\n");
  rl.close();
  if (password.length < 14) throw new Error("Password too short.");
  const existing = await db.organization.findMany();
  if (existing.length > 1)
    throw new Error(
      "Multiple organizations found; provision through an existing owner account.",
    );
  const org = existing[0] || (await provisionOrganization());
  if (
    await db.membership.count({
      where: { organizationId: org.id, role: "OWNER" },
    })
  )
    throw new Error(
      "An owner already exists. Use Settings → Staff & access; recovery is a separate controlled procedure.",
    );
  await provisionUser(org.id, name, email, password);
  console.log(
    `Created owner ${email}. Sign in at ${process.env.APP_URL} and enroll MFA.`,
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
