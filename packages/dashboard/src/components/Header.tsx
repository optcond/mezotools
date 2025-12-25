import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { SVGProps } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const XLogo = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      fill="currentColor"
      d="M20.29 2h3.21l-7.02 8.02 8.24 11.01h-6.46l-5.06-6.63L6.6 21.03H3.38l7.53-8.6L3 2h6.6l4.58 6.01L20.29 2Z"
      transform="translate(-2 0)"
    />
  </svg>
);

interface HeaderProps {
  blockNumber: number | null;
  blockTimestamp: string | null;
  lastUpdatedAt: string | null;
  btcPrice: number;
  isSyncing?: boolean;
  onBridgedAssetsClick?: () => void;
  onDebtCalculatorClick?: () => void;
  onSwapClick?: () => void;
  onRedeemClick?: () => void;
  onBribesClick?: () => void;
}

export const Header = ({
  blockNumber,
  blockTimestamp,
  lastUpdatedAt,
  btcPrice,
  isSyncing,
  onBridgedAssetsClick,
  onDebtCalculatorClick,
  onSwapClick,
  onRedeemClick,
  onBribesClick,
}: HeaderProps) => {
  const updatedLabel = lastUpdatedAt
    ? formatDistanceToNow(new Date(lastUpdatedAt), { addSuffix: true })
    : "Waiting for first sync";
  const blockTimestampLabel = blockTimestamp
    ? formatDistanceToNow(new Date(blockTimestamp), { addSuffix: true })
    : null;

  return (
    <header className="z-50 w-full glass-card border-b border-card-border/60 sm:sticky sm:top-0">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <h1 className="text-lg font-bold uppercase tracking-wider text-primary sm:text-xl">
            Mezo MUSD Monitor
          </h1>
          <div className="flex flex-wrap items-center justify-start gap-2">
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="border border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary"
            >
              <a
                href="https://mezo.org/borrow"
                target="_blank"
                rel="noopener noreferrer"
              >
                Borrow on Mezo
              </a>
            </Button>
            {/* <Button
              size="sm"
              variant="ghost"
              className="border border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary"
              onClick={onSwapClick}
            >
              Swap
            </Button> */}
            <Button
              size="sm"
              variant="ghost"
              className="border border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary"
              onClick={onBridgedAssetsClick}
            >
              Bridged assets
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="border border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary"
              onClick={onDebtCalculatorClick}
            >
              Debt calculator
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="border border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary"
              onClick={onRedeemClick}
            >
              Redeem
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="border border-primary bg-transparent text-primary hover:bg-primary/10 hover:text-primary"
              onClick={onBribesClick}
            >
              Bribes
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="rounded-full"
            >
              <a
                href="https://x.com/zho_spa"
                target="_blank"
                rel="noopener noreferrer"
              >
                <XLogo className="h-5 w-5" />
                <span className="sr-only">x.com/zho_spa</span>
              </a>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs sm:gap-4 sm:text-sm">
          {isSyncing && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Syncing
            </Badge>
          )}
          <span className="text-muted-foreground">
            Last update{" "}
            <span className="font-medium text-foreground">{updatedLabel}</span>
          </span>
          <span className="text-muted-foreground">
            Block:{" "}
            <span className="font-mono text-foreground">
              {blockNumber ? blockNumber.toLocaleString() : "—"}
            </span>
          </span>
          {blockTimestampLabel && (
            <span className="text-muted-foreground">
              Indexed block {blockTimestampLabel}
            </span>
          )}
          <span className="text-muted-foreground">
            BTC:{" "}
            <span className="font-semibold text-foreground">
              $
              {btcPrice.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </span>
        </div>
      </div>
    </header>
  );
};
