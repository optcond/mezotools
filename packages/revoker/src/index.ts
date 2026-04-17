import "dotenv/config";
import { exit } from "process";
import { loadConfig } from "./config";
import { Revoker } from "./revoker";

async function main() {
  console.info(`[${new Date().toISOString()}] Revoker run started`);
  try {
    const noDbRun = process.argv.includes("-nodbrun");
    const config = loadConfig(process.env, { requireSupabase: !noDbRun });
    const revoker = Revoker.createFromEnvConfig(config, { noDbRun });
    const stats = await revoker.run({ noDbRun });
    console.info(
      `[${new Date().toISOString()}] Revoker run completed: ranges=${stats.ranges}, logs=${stats.totalLogs}, parsed=${stats.parsedEvents}, latestStates=${stats.uniqueStates}, upserted=${stats.upserted}`,
    );
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Revoker run failed`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    exit();
  }
}

void main();
