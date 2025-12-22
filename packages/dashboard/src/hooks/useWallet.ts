import { useAccount, useWalletClient } from "wagmi";
import type { WalletClient } from "viem";

export type WalletControls = {
  account: string | null;
  walletClient: WalletClient | null;
};

export const useWallet = (): WalletControls => {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  return {
    account: address ?? null,
    walletClient: walletClient ?? null,
  };
};
