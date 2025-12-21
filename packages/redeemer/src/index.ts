import {
  MezoChain,
  PriceFeedFetcher,
  TroveFetcher,
  TroveFetcherWrapper,
} from "@mtools/shared";
import { createPublicClient, createWalletClient, webSocket } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { RedemptionMaker } from "@mtools/shared";
import { pathToFileURL } from "node:url";

const account = privateKeyToAccount(process.env.PK as `0x${string}`);

const socket = webSocket(
  MezoChain.rpcUrls.default.webSocket?.length
    ? MezoChain.rpcUrls.default.webSocket[0]
    : ""
);

const client = createPublicClient({
  chain: MezoChain,
  transport: socket,
});

const walletClient = createWalletClient({
  chain: MezoChain,
  transport: socket,
  account,
});

export const redemptionMaker = async () => {
  const troveFetcher = new TroveFetcher(client);
  const priceFeedContractAddress = await troveFetcher.getPriceFeedAddress();
  const priceFeedFetcher = new PriceFeedFetcher(
    client,
    priceFeedContractAddress
  );
  const fetcher = new TroveFetcherWrapper(troveFetcher, priceFeedFetcher);

  return new RedemptionMaker(client, fetcher, walletClient);
};

export async function main() {
  const maker = await redemptionMaker();
  const hints = await maker.getRedemptionHintsForAmount(`10000`, 50);
  const simulation = await maker.simulateRedemption(
    hints,
    walletClient.account?.address
  );
  console.log(simulation);
}

const isDirectRun =
  typeof process !== "undefined" &&
  typeof process.argv?.[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  // eslint-disable-next-line no-void
  void main();
}

export { RedemptionMaker };
