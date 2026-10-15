import "./env";
import { db } from "../lib/db";
async function main() {
  const [kind, status, ...detail] = process.argv.slice(2);
  if (
    !["BACKUP", "RESTORE_CHECK"].includes(kind) ||
    !["SUCCESS", "FAILED"].includes(status)
  )
    throw new Error("Invalid job arguments");
  for (const org of await db.organization.findMany()) {
    await db.jobRun.create({
      data: {
        organizationId: org.id,
        kind,
        status,
        detail: detail.join(" ").slice(0, 500),
      },
    });
    if (status === "FAILED")
      await db.notification.create({
        data: {
          organizationId: org.id,
          key: `${kind}:${Date.now()}`,
          title: `${kind.toLowerCase()} failed`,
          message: "Review backup service logs and configuration.",
          target: "settings",
        },
      });
  }
}
main()
  .catch(() => {
    console.error("Could not persist job status");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
