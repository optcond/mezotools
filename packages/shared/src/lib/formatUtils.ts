import { formatUnits } from "viem";

/**
 * Format a bigint with 18 decimals (veBTC, voting power, etc.) as a locale string.
 */
export const formatVotingPower = (value: bigint, maxDecimals = 4): string =>
  Number(formatUnits(value, 18)).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });

/**
 * Format an ERC-20 token amount with arbitrary decimals.
 */
export const formatTokenAmount = (
  value: bigint,
  decimals: number,
  maxDecimals = 6,
): string =>
  Number(formatUnits(value, decimals)).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });

/**
 * Format a number as a USD currency string.
 */
export const formatUsd = (value: number, maxDecimals = 2): string =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: maxDecimals,
  });

/**
 * Compute the share (0–100) of a bigint within a total bigint, as a number.
 * Returns null if total is 0.
 */
export const bigintSharePct = (part: bigint, total: bigint): number | null => {
  if (total === 0n) return null;
  return (Number(formatUnits(part, 18)) / Number(formatUnits(total, 18))) * 100;
};
