import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApprovalState,
  ApprovalStateRow,
  IndexerCheckpoint,
  IndexerCheckpointRow,
} from "./types";

type QueryClient = Pick<SupabaseClient, "from">;

export const buildApprovalStateKey = (approval: ApprovalState): string =>
  [
    approval.chainId,
    approval.standard,
    approval.tokenAddress.toLowerCase(),
    approval.ownerAddress.toLowerCase(),
    approval.spenderAddress.toLowerCase(),
    approval.tokenId?.toString() ?? "-",
  ].join(":");

const isNewerThanRow = (approval: ApprovalState, row: ApprovalStateRow) =>
  approval.lastBlockNumber > row.last_block_number ||
  (approval.lastBlockNumber === row.last_block_number &&
    approval.lastLogIndex > row.last_log_index);

export class RevokerRepository {
  private readonly queryClient: QueryClient;

  constructor(client: SupabaseClient, schema?: string) {
    this.queryClient = schema
      ? (client.schema(schema) as unknown as QueryClient)
      : client;
  }

  private from(table: string) {
    return this.queryClient.from(table);
  }

  async getCheckpoint(indexerName: string): Promise<IndexerCheckpoint | null> {
    const { data, error } = await this.from("indexer_checkpoints")
      .select("*")
      .eq("indexer_name", indexerName)
      .maybeSingle<IndexerCheckpointRow>();

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

    const { error } = await this.from("indexer_checkpoints").upsert(row, {
      onConflict: "indexer_name",
    });

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
    const { data, error } = await this.from("approvals_state")
      .select("state_key,last_block_number,last_log_index")
      .in("state_key", keys)
      .returns<ApprovalStateRow[]>();

    if (error) {
      throw new Error(`Failed to fetch existing approval states: ${error.message}`);
    }

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

    const { error: upsertError } = await this.from("approvals_state").upsert(
      rows,
      {
        onConflict: "state_key",
      },
    );

    if (upsertError) {
      throw new Error(`Failed to upsert approval states: ${upsertError.message}`);
    }

    return rows.length;
  }
}
