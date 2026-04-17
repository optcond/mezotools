import "dotenv/config";
import { exit } from "process";
import { loadConfig } from "./config";
import { Revoker } from "./revoker";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main() {
  console.info(`[${new Date().toISOString()}] Revoker run started`);
  try {
    const noDbRun = process.argv.includes("-nodbrun");
    const backfillUntilDone = process.argv.includes("-backfill-until-done");
    const forwardFillUntilDone = process.argv.includes(
      "-forward-fill-until-done",
    );
    const config = loadConfig(process.env, { requireSupabase: !noDbRun });
    const revoker = Revoker.createFromEnvConfig(config, { noDbRun });

    if (backfillUntilDone && forwardFillUntilDone) {
      throw new Error(
        "Use only one fill mode: -backfill-until-done or -forward-fill-until-done",
      );
    }

    if (forwardFillUntilDone) {
      if (noDbRun) {
        throw new Error("-forward-fill-until-done cannot be combined with -nodbrun");
      }

      while (true) {
        try {
          const stats = await revoker.runForwardFillUntilDone();
          console.info(
            `[${new Date().toISOString()}] Forward fill completed: ranges=${stats.ranges}, logs=${stats.totalLogs}, parsed=${stats.parsedEvents}, latestStates=${stats.uniqueStates}, flushedStates=${stats.flushedStates}, from=${stats.fromBlock}, to=${stats.toBlock}`,
          );
          break;
        } catch (error) {
          console.error(
            `[${new Date().toISOString()}] Forward fill failed; retrying from the last saved checkpoint in ${config.backfillLoopPauseMs}ms`,
          );
          console.error(error instanceof Error ? error.message : String(error));
          await sleep(config.backfillLoopPauseMs);
        }
      }
    } else if (backfillUntilDone) {
      if (noDbRun) {
        throw new Error("-backfill-until-done cannot be combined with -nodbrun");
      }

      let iteration = 0;
      while (true) {
        iteration++;
        console.info(
          `[${new Date().toISOString()}] Backfill iteration ${iteration} started`,
        );
        let stats;
        let status;
        try {
          stats = await revoker.run({ noDbRun });
          status = await revoker.getStatus();
        } catch (error) {
          console.error(
            `[${new Date().toISOString()}] Backfill iteration ${iteration} failed; retrying from the last saved checkpoint in ${config.backfillLoopPauseMs}ms`,
          );
          console.error(error instanceof Error ? error.message : String(error));
          await sleep(config.backfillLoopPauseMs);
          continue;
        }

        console.info(
          `[${new Date().toISOString()}] Backfill iteration ${iteration} completed: ranges=${stats.ranges}, logs=${stats.totalLogs}, parsed=${stats.parsedEvents}, latestStates=${stats.uniqueStates}, upserted=${stats.upserted}, approvalStates=${status.approvalStateCount ?? "unknown"}, checkpoint=${status.checkpoint?.lastIndexedBlock ?? "none"}, historyStart=${status.historyStartBlock}`,
        );

        if (status.backfillComplete) {
          console.info(
            `[${new Date().toISOString()}] Backfill completed. Switching to regular one-shot runs is safe.`,
          );
          break;
        }

        if (stats.ranges === 0) {
          throw new Error(
            "Backfill made no progress; check checkpoint and configuration.",
          );
        }

        await sleep(config.backfillLoopPauseMs);
      }
    } else {
      const stats = await revoker.run({ noDbRun });
      console.info(
        `[${new Date().toISOString()}] Revoker run completed: ranges=${stats.ranges}, logs=${stats.totalLogs}, parsed=${stats.parsedEvents}, latestStates=${stats.uniqueStates}, upserted=${stats.upserted}`,
      );
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Revoker run failed`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    exit();
  }
}

void main();
