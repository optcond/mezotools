import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApprovalState,
  ApprovalStateRow,
  IndexerCheckpoint,
  IndexerCheckpointRow,
} from "./types";

type QueryClient = Pick<SupabaseClient, "from">;

const DEFAULT_DB_TIMEOUT_MS = 10_000;
const DEFAULT_DB_RETRIES = 3;
const EXISTING_STATE_LOOKUP_BATCH_SIZE = 25;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const buildApprovalStateKey = (approval: ApprovalState): string =>
  approval.standard === "erc721" && approval.tokenId !== null
    ? [
        approval.chainId,
        approval.standard,
        approval.tokenAddress.toLowerCase(),
        approval.ownerAddress.toLowerCase(),
        "token",
        approval.tokenId.toString(),
      ].join(":")
    : [
        approval.chainId,
        approval.standard,
        approval.tokenAddress.toLowerCase(),
        approval.ownerAddress.toLowerCase(),
        approval.spenderAddress.toLowerCase(),
        "-",
      ].join(":");

const isNewerThanRow = (approval: ApprovalState, row: ApprovalStateRow) =>
  approval.lastBlockNumber > row.last_block_number ||
  (approval.lastBlockNumber === row.last_block_number &&
    approval.lastLogIndex > row.last_log_index);

export class RevokerRepository {
  private readonly queryClient: QueryClient;

  constructor(
    client: SupabaseClient,
    schema?: string,
    private readonly dbTimeoutMs = DEFAULT_DB_TIMEOUT_MS,
    private readonly dbRetries = DEFAULT_DB_RETRIES,
  ) {
    this.queryClient = schema
      ? (client.schema(schema) as unknown as QueryClient)
      : client;
  }

  private from(table: string) {
    return this.queryClient.from(table);
  }

  private async withRetry<T>(
    label: string,
    operation: () => PromiseLike<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.dbRetries + 1; attempt++) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          Promise.resolve(operation()),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              reject(
                new Error(`${label} timed out after ${this.dbTimeoutMs}ms`),
              );
            }, this.dbTimeoutMs);
          }),
        ]);
        if (timeout) clearTimeout(timeout);
        return result;
      } catch (error) {
        if (timeout) clearTimeout(timeout);
        lastError = error;
        if (attempt > this.dbRetries) break;

        const delayMs = Math.min(1_000 * 2 ** (attempt - 1), 5_000);
        console.warn(
          `${label} failed on attempt ${attempt}/${this.dbRetries + 1}; retrying in ${delayMs}ms`,
          error instanceof Error ? error.message : String(error),
        );
        await sleep(delayMs);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async getCheckpoint(indexerName: string): Promise<IndexerCheckpoint | null> {
    const { data, error } = await this.withRetry(
      "Fetch revoker checkpoint",
      () =>
        this.from("indexer_checkpoints")
          .select("*")
          .eq("indexer_name", indexerName)
          .maybeSingle<IndexerCheckpointRow>(),
    );

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to fetch revoker checkpoint: ${error.message}`);
    }

    if (!data) return null;

    return {
      indexerName: data.indexer_name,
      lastIndexedBlock: Number(data.last_indexed_block),
      lastSafeBlock: Number(data.last_safe_block),
    };
  }

  async upsertCheckpoint(checkpoint: IndexerCheckpoint): Promise<void> {
    const row: IndexerCheckpointRow = {
      indexer_name: checkpoint.indexerName,
      last_indexed_block: checkpoint.lastIndexedBlock,
      last_safe_block: checkpoint.lastSafeBlock,
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.withRetry("Upsert revoker checkpoint", () =>
      this.from("indexer_checkpoints").upsert(row, {
        onConflict: "indexer_name",
      }),
    );

    if (error) {
      throw new Error(`Failed to upsert revoker checkpoint: ${error.message}`);
    }
  }

  async upsertApprovalStates(
    approvals: ApprovalState[],
    batchSize: number,
  ): Promise<number> {
    if (approvals.length === 0) return 0;

    let upserted = 0;
    for (let index = 0; index < approvals.length; index += batchSize) {
      const batch = approvals.slice(index, index + batchSize);
      upserted += await this.upsertApprovalStateBatch(batch);
    }

    return upserted;
  }

  private async fetchExistingApprovalStateRows(
    keys: string[],
  ): Promise<ApprovalStateRow[]> {
    const rows: ApprovalStateRow[] = [];

    for (
      let index = 0;
      index < keys.length;
      index += EXISTING_STATE_LOOKUP_BATCH_SIZE
    ) {
      const batch = keys.slice(index, index + EXISTING_STATE_LOOKUP_BATCH_SIZE);
      const { data, error } = await this.withRetry(
        `Fetch existing approval states (${batch.length} keys, ${index + 1}-${index + batch.length}/${keys.length})`,
        () =>
          this.from("approvals_state")
            .select("state_key,last_block_number,last_log_index")
            .in("state_key", batch)
            .returns<ApprovalStateRow[]>(),
      );

      if (error) {
        throw new Error(
          `Failed to fetch existing approval states: ${error.message}`,
        );
      }

      rows.push(...(data ?? []));
    }

    return rows;
  }

  private async upsertApprovalStateBatch(
    approvals: ApprovalState[],
  ): Promise<number> {
    const latestByKey = new Map<string, ApprovalState>();
    for (const approval of approvals) {
      const key = buildApprovalStateKey(approval);
      const existing = latestByKey.get(key);
      if (
        !existing ||
        approval.lastBlockNumber > existing.lastBlockNumber ||
        (approval.lastBlockNumber === existing.lastBlockNumber &&
          approval.lastLogIndex > existing.lastLogIndex)
      ) {
        latestByKey.set(key, approval);
      }
    }

    const keys = [...latestByKey.keys()];
    console.info(
      `Preparing approval state upsert: input=${approvals.length}, latestKeys=${keys.length}, existingLookupChunk=${EXISTING_STATE_LOOKUP_BATCH_SIZE}`,
    );
    const data = await this.fetchExistingApprovalStateRows(keys);
    const existingByKey = new Map((data ?? []).map((row) => [row.state_key, row]));
    const now = new Date().toISOString();
    const rows = [...latestByKey.entries()].flatMap(
      ([stateKey, approval]): ApprovalStateRow[] => {
        const existing = existingByKey.get(stateKey);
        if (existing && !isNewerThanRow(approval, existing)) return [];

        return [
          {
            state_key: stateKey,
            chain_id: approval.chainId,
            standard: approval.standard,
            token_address: approval.tokenAddress.toLowerCase(),
            owner_address: approval.ownerAddress.toLowerCase(),
            spender_address: approval.spenderAddress.toLowerCase(),
            token_id: approval.tokenId?.toString() ?? null,
            approved_value: approval.approvedValue?.toString() ?? null,
            approved_bool: approval.approvedBool,
            last_block_number: approval.lastBlockNumber,
            last_log_index: approval.lastLogIndex,
            last_tx_hash: approval.lastTxHash,
            updated_at: now,
          },
        ];
      },
    );

    if (rows.length === 0) return 0;

    const { error: upsertError } = await this.withRetry(
      "Upsert approval states",
      () =>
        this.from("approvals_state").upsert(rows, {
          onConflict: "state_key",
        }),
    );

    if (upsertError) {
      throw new Error(`Failed to upsert approval states: ${upsertError.message}`);
    }

    return rows.length;
  }

  async getApprovalStateCount(): Promise<number> {
    const { count, error } = await this.withRetry(
      "Count approval states",
      () =>
        this.from("approvals_state").select("state_key", {
          count: "exact",
          head: true,
        }),
    );

    if (error) {
      throw new Error(`Failed to count approval states: ${error.message}`);
    }

    return count ?? 0;
  }
}
