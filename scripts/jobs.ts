import "./env";
import { db } from "../lib/db";
import { runRecurring, refreshNotifications } from "../lib/services/operations";
import { notify, transaction } from "../lib/services/ledger";
let stop = false;
process.on("SIGTERM", () => {
  stop = true;
});
process.on("SIGINT", () => {
  stop = true;
});
async function run() {
  for (const org of await db.organization.findMany()) {
    const actor = {
      organizationId: org.id,
      userId: "system:scheduler",
      role: "OWNER" as const,
      name: "Scheduler",
    };
    try {
      await runRecurring(actor);
      await refreshNotifications(actor);
    } catch {
      await transaction(async (tx) => {
        await tx.jobRun.create({
          data: {
            organizationId: org.id,
            kind: "RECURRING",
            status: "FAILED",
            detail:
              "Recurring run failed. Inspect server health; retry is idempotent.",
          },
        });
        await notify(
          tx,
          actor,
          `recurring-failed:${new Date().toISOString().slice(0, 13)}`,
          "Recurring billing needs attention",
          "A scheduled run failed. Review system status and retry.",
          "settings",
        );
      });
      console.error("Recurring run failed", { organizationId: org.id });
    }
  }
}
async function main() {
  do {
    await run();
    if (!process.argv.includes("--watch")) break;
    for (let seconds = 0; seconds < 3600 && !stop; seconds++)
      await new Promise((r) => setTimeout(r, 1000));
  } while (!stop);
}
main()
  .catch(() => {
    console.error("Scheduler could not connect to database");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
