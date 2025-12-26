import "dotenv/config";
import { Indexer } from "./indexer";
import { exit } from "process";

async function main() {
  let indexer: Indexer | undefined;
  console.info(`[${new Date().toISOString()}] Indexer run started`);
  try {
    indexer = await Indexer.createFromEnv();
    await indexer.run();
    console.info(`[${new Date().toISOString()}] Indexer run completed`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Indexer run failed`);
    console.log((error as Error).message);
    process.exitCode = 1;
  } finally {
    if (indexer) {
      try {
        await indexer.close();
      } catch (closeError) {
        console.warn(
          `[${new Date().toISOString()}] Failed to close indexer cleanly`,
          closeError
        );
      }
    }
    exit();
  }
}

void main();
