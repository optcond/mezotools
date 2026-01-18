import { createPublicClient, http, PublicClient } from "viem";
import { MezoChain } from "../types";

export const createMezoPublicClient = (): PublicClient => {
  return createPublicClient({
    chain: MezoChain,
    transport: http(MezoChain.rpcUrls.default.http[0]),
  });
};
