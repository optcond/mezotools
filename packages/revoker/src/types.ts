import type { Address, Hex } from "viem";

export type ApprovalStandard = "erc20" | "erc721" | "erc1155" | "unknown";

export interface ApprovalState {
  chainId: number;
  standard: ApprovalStandard;
  tokenAddress: Address;
  ownerAddress: Address;
  spenderAddress: Address;
  tokenId: bigint | null;
  approvedValue: bigint | null;
  approvedBool: boolean | null;
  lastBlockNumber: number;
  lastLogIndex: number;
  lastTxHash: Hex;
}

export interface IndexerCheckpoint {
  indexerName: string;
  lastIndexedBlock: number;
  lastSafeBlock: number;
}

export interface ApprovalStateRow {
  state_key: string;
  chain_id: number;
  standard: ApprovalStandard;
  token_address: string;
  owner_address: string;
  spender_address: string;
  token_id: string | null;
  approved_value: string | null;
  approved_bool: boolean | null;
  last_block_number: number;
  last_log_index: number;
  last_tx_hash: string;
  updated_at: string;
}

export interface IndexerCheckpointRow {
  indexer_name: string;
  last_indexed_block: number;
  last_safe_block: number;
  updated_at: string;
}
