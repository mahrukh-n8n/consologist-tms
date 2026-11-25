import "dotenv/config";
import { getPrisma } from "@/lib/db";
import { runDueAlerts } from "@/lib/notifications/email-alerts";

async function main() {
  const db = getPrisma();
  const result = await runDueAlerts(db);
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
