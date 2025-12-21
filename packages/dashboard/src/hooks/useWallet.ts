import { useState, useEffect } from "react";
import { BrowserProvider } from "ethers";
import { MezoChain } from "@mtools/shared";
import { createWalletClient, custom, WalletClient } from "viem";
import { useToast } from "@/hooks/use-toast";

export type WalletControls = {
  account: string | null;
  isConnecting: boolean;
  connect: () => Promise<void> | void;
  disconnect: () => void;
  walletClient: WalletClient | null;
};

export const useWallet = () => {
  const [account, setAccount] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    checkConnection();

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", () => window.location.reload());
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener(
          "accountsChanged",
          handleAccountsChanged
        );
      }
    };
  }, []);

  const buildWalletClient = (address: `0x${string}`) => {
    if (!window.ethereum) {
      return null;
    }

    return createWalletClient({
      chain: MezoChain,
      account: address,
      transport: custom(window.ethereum),
    });
  };

  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) {
      setAccount(null);
      setWalletClient(null);
    } else {
      const address = accounts[0] as `0x${string}`;
      setAccount(address);
      const client = buildWalletClient(address);
      if (client) {
        setWalletClient(client);
      }
    }
  };

  const checkConnection = async () => {
    if (window.ethereum) {
      try {
        const provider = new BrowserProvider(window.ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0 && accounts[0]?.address) {
          const address = accounts[0].address as `0x${string}`;
          setAccount(address);
          const client = buildWalletClient(address);
          if (client) {
            setWalletClient(client);
          }
        }
      } catch (error) {
        console.error("Error checking connection:", error);
      }
    }
  };

  const connect = async () => {
    if (!window.ethereum) {
      toast({
        title: "MetaMask not found",
        description: "Please install MetaMask to connect your wallet.",
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const address = accounts[0] as `0x${string}`;
      setAccount(address);
      const client = buildWalletClient(address);
      if (client) {
        setWalletClient(client);
      }
      toast({
        title: "Wallet connected",
        description: `Connected to ${address.substring(
          0,
          6
        )}...${address.substring(38)}`,
      });
    } catch (error: any) {
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect wallet",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setAccount(null);
    setWalletClient(null);
    toast({
      title: "Wallet disconnected",
      description: "Your wallet has been disconnected.",
    });
  };

  return { account, isConnecting, connect, disconnect, walletClient };
};

declare global {
  interface Window {
    ethereum?: any;
  }
}
