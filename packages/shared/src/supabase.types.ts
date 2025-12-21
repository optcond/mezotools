export interface SupabaseOptions {
  url: string;
  serviceKey: string;
  schema?: string;
}

export interface SystemSnapshot {
  collateral: number;
  debt: number;
  ratio: number;
  btcPrice: number;
  musdToUsdcPrice: number | null;
}

export interface LiquidationRow {
  id: string;
  borrower: string;
  debt: number;
  collateral: number;
  operation: number;
  tx_hash: string;
  block_number: number;
  log_index: number;
  block_timestamp: string;
  tx_status: "success" | "failed";
}

export interface RedemptionRow {
  id: string;
  attempted_amount: number;
  actual_amount: number;
  collateral_sent: number;
  collateral_fee: number;
  affected_borrowers: string[] | null;
  tx_hash: string;
  block_number: number;
  log_index: number;
  block_timestamp: string;
  tx_status: "success" | "failed";
}

export interface TroveRow {
  owner: string;
  collateral: number;
  principal_debt: number;
  interest: number;
  collaterization_ratio: number;
  updated_at: string;
}

export interface PriceRow {
  id: string;
  price: number;
  source: string;
  block_number: number;
  recorded_at: string;
}

export interface PriceBlockRow {
  block_number: number;
}

export interface IndexerStateRow {
  key: string;
  block_number: number;
  updated_at: string;
}

export interface DailyMetricsRow {
  day: string;
  trove_count: number;
  collateral: number;
  debt: number;
  tcr: number;
  btc_price: number;
  updated_at: string;
}

export interface SystemSnapshotPriceRow {
  musd_to_usdc_price: number | null;
}

export interface BridgeAssetRow {
  token_symbol: string;
  token_name: string;
  ethereum_symbol: string;
  mezo_address: string;
  ethereum_address: string;
  bridge_address: string;
  balance_raw: string;
  balance_formatted: string;
  decimals: number;
  updated_at: string;
}
