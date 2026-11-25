import "dotenv/config";
import { getPrisma } from "@/lib/db";
import { runDueSchedules } from "@/lib/backup/schedule";

async function main() {
  const results = await runDueSchedules(getPrisma());
  console.log(JSON.stringify({ runs: results.length, results }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
