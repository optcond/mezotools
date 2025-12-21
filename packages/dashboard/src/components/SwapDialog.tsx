import { useMemo } from "react";
import {
  CowSwapWidget,
  CowSwapWidgetParams,
  CowSwapWidgetPalette,
  TradeType,
  EthereumProvider,
} from "@cowprotocol/widget-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const widgetTheme: CowSwapWidgetPalette = {
  baseTheme: "dark",
  primary: "#f04242",
  background: "#070a12",
  paper: "#0c111d",
  text: "#f8fafc",
  danger: "#f47171",
  warning: "#facc14",
  alert: "#f4894d",
  info: "#2894b8",
  success: "#21c45d",
};

const baseParams: CowSwapWidgetParams = {
  appCode: "Mezo Dashboard",
  width: "100%",
  height: "640px",
  chainId: 1,
  tokenLists: [
    "https://files.cow.fi/tokens/CowSwap.json",
    "https://raw.githubusercontent.com/cowprotocol/token-lists/main/src/public/CoinGecko.1.json",
  ],
  tradeType: TradeType.SWAP,
  sell: {
    asset: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
    amount: "10000",
  },
  buy: {
    asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    amount: "0",
  },
  enabledTradeTypes: [
    TradeType.SWAP,
    TradeType.LIMIT,
    TradeType.ADVANCED,
    TradeType.YIELD,
  ],
  theme: widgetTheme,
  standaloneMode: false,
  disableToastMessages: false,
  disableProgressBar: false,
  partnerFee: {
    bps: 1,
    recipient: "0x7B7B8C355918dF698bf6403b3a07D1888F10F5Cf",
  },
  hideBridgeInfo: false,
  hideOrdersTable: false,
  customTokens: [
    {
      chainId: 1,
      address: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
      name: "Mezo USD",
      decimals: 18,
      symbol: "MUSD",
    },
  ],
};

interface SwapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SwapDialog = ({ open, onOpenChange }: SwapDialogProps) => {
  const provider = typeof window !== "undefined" ? window.ethereum : undefined;

  const widgetParams = useMemo<CowSwapWidgetParams>(() => {
    if (provider) {
      return baseParams;
    }

    return {
      ...baseParams,
      standaloneMode: true,
    };
  }, [provider]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-4 overflow-hidden sm:w-full sm:max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Swap assets</DialogTitle>
          <DialogDescription className="space-y-1 text-sm">
            <p>
              Execute swaps directly from the dashboard using the CoW Swap
              Widget. The palette is tuned to match the Mezo monitor&apos;s
              glass aesthetic for a seamless experience.
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="rounded-2xl border border-card-border/60 bg-card/70 p-2 shadow-inner">
            <CowSwapWidget params={widgetParams} provider={provider} />
          </div>
          <p className="text-xs text-muted-foreground">
            Swaps settle through CoW Protocol&apos;s batch auctions. The widget
            shares the active browser wallet; if you prefer to connect from the
            widget UI itself, keep a provider extension such as MetaMask
            enabled.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
