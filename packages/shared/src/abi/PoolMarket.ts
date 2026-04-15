import { type Abi, parseAbiItem } from "viem";

export const PoolMarketAbi = [
  parseAbiItem("function name() view returns (string)"),
  parseAbiItem("function symbol() view returns (string)"),
  parseAbiItem("function decimals() view returns (uint8)"),
  parseAbiItem("function token0() view returns (address)"),
  parseAbiItem("function token1() view returns (address)"),
  parseAbiItem("function stable() view returns (bool)"),
  parseAbiItem("function getReserves() view returns (uint112,uint112,uint32)"),
  parseAbiItem("function totalSupply() view returns (uint256)"),
] as const satisfies Abi;

export const GaugeMarketAbi = [
  parseAbiItem("function stakingToken() view returns (address)"),
  parseAbiItem("function rewardToken() view returns (address)"),
  parseAbiItem("function totalSupply() view returns (uint256)"),
  parseAbiItem("function rewardRate() view returns (uint256)"),
  parseAbiItem("function periodFinish() view returns (uint256)"),
] as const satisfies Abi;

export const ERC20MetaAbi = [
  parseAbiItem("function symbol() view returns (string)"),
  parseAbiItem("function decimals() view returns (uint8)"),
] as const satisfies Abi;

export const ERC20BalanceAbi = [
  parseAbiItem("function balanceOf(address) view returns (uint256)"),
] as const satisfies Abi;

export const AerodromeOracleAbi = [
  parseAbiItem(
    "function getRate(address srcToken, address dstToken, bool useWrappers) view returns (uint256 weightedRate)",
  ),
] as const satisfies Abi;
