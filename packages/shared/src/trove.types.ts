export enum Status {
  nonExistent,
  active,
  closedByOwner,
  closedByLiquidation,
  closedByRedemption,
}

export interface InterestRateChange {
  interestRate: number;
  blockNumber: bigint;
}

export interface TroveData {
  owner: string;
  collateral: bigint;
  principal: bigint;
  interest: bigint;
  stake: bigint;
  status: Status;
  interestRate: bigint;
  lastInterestUpdateTime: bigint;
  pendingCollateral: bigint;
  pendingPrincipal: bigint;
  pendingInterest: bigint;
  ICR: bigint;
}

export interface TroveLiquidationEvent {
  borrower: string;
  debt: number;
  collateral: number;
  operation: number;
  txHash: `0x${string}`;
  blockNumber: number;
  logIndex: number;
  timestamp: number;
  status: "success" | "failed";
}

export interface TroveRedemptionEvent {
  attemptedAmount: number;
  actualAmount: number;
  collateralSent: number;
  collateralFee: number;
  affectedBorrowers: string[];
  txHash: `0x${string}`;
  blockNumber: number;
  logIndex: number;
  timestamp: number;
  status: "success" | "failed";
}

export interface FTroveData {
  owner: string;
  collateral: number;
  principal_debt: number;
  interest: number;
  collaterizationRatio: number;
}

export interface FTCR {
  collateral: number;
  debt: number;
  ratio: number;
  btcPrice: number;
}
