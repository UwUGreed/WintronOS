import "./env";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
async function main() {
  const original = new URL(process.env.DATABASE_URL!);
  const admin = new PrismaClient();
  const exists = await admin.$queryRaw<
    { exists: boolean }[]
  >`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname='wintron_test')`;
  if (!exists[0].exists)
    await admin.$executeRawUnsafe("CREATE DATABASE wintron_test");
  await admin.$disconnect();
  original.pathname = "/wintron_test";
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: original.toString() },
    stdio: "inherit",
  });
  console.log("Isolated test database ready.");
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
