export interface Trove {
  owner: string;
  collateralBtc: number;
  principalDebt: number;
  interest: number;
  icr?: number; // On-chain ICR (1e18 precision, normalized to number)
  cr?: number; // Calculated client-side
  debt?: number; // Calculated client-side
}

export interface BlockData {
  height: number;
  timestamp: number;
  btcPrice: number;
}

export interface TroveSnapshot {
  troves: Trove[];
  blockHeight: number;
}

export interface TroveDiff {
  updated: Trove[];
  removed: string[]; // owner addresses
  blockHeight: number;
}

export interface WebSocketMessage {
  type: "block" | "snapshot" | "diff";
  data: BlockData | TroveSnapshot | TroveDiff;
}

export interface DashboardMetrics {
  totalTroves: number;
  totalCollateral: number;
  totalDebt: number;
  tcr: number;
  tcrMinus10: number;
  tcrMinus20: number;
  trovesUnder120: number;
  trovesUnder150: number;
  trovesUnder200: number;
  collateralUnder120: number;
  collateralUnder150: number;
  collateralUnder200: number;
}

export interface RiskLevel {
  level: "critical" | "high" | "medium" | "low" | "safe";
  color: string;
  threshold: number;
}

export interface ConnectionStatus {
  connected: boolean;
  latency: number;
  lastUpdate: number;
  reconnectAttempts: number;
}
