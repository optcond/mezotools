import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { BridgeAsset } from "@/hooks/useMonitorData";

interface BridgedAssetsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: BridgeAsset[];
  isLoading?: boolean;
}

const formatBalance = (value: string) => {
  const asNumber = Number.parseFloat(value);
  if (Number.isFinite(asNumber)) {
    return asNumber.toLocaleString(undefined, {
      maximumFractionDigits: 4,
    });
  }
  return value;
};

const truncateAddress = (address: string) => {
  if (!address) {
    return "—";
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

export const BridgedAssetsDialog = ({
  open,
  onOpenChange,
  assets,
  isLoading,
}: BridgedAssetsDialogProps) => {
  const sortedAssets = [...assets].sort((a, b) =>
    a.token_name.localeCompare(b.token_name)
  );
  const bridgeAddress = assets.length > 0 ? assets[0].bridge_address : "0x—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-4 overflow-hidden sm:w-full sm:max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Bridged assets</DialogTitle>
          <DialogDescription className="space-y-1 text-sm">
            <p>
              Live balances held by the Mezo bridge contract on Ethereum. Data
              refreshes every indexer cycle.
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              Bridge contract:{" "}
              {bridgeAddress !== "0x—" ? (
                <a
                  href={`https://etherscan.io/address/${bridgeAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-2 hover:underline"
                >
                  {bridgeAddress}
                </a>
              ) : (
                "—"
              )}
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          {isLoading && assets.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <Skeleton key={idx} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : sortedAssets.length === 0 ? (
            <div className="rounded-xl border border-dashed border-card-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No bridged assets found yet. The indexer will populate this list
              after the next sync.
            </div>
          ) : (
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4 pb-4">
                {sortedAssets.map((asset) => (
                  <div
                    key={asset.token_symbol}
                    className="glass-card rounded-xl border border-card-border/60 p-4 shadow-sm transition hover:border-primary/60"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-semibold text-foreground">
                            {asset.token_name}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {asset.ethereum_symbol}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Backed by {asset.ethereum_symbol} at{" "}
                          {truncateAddress(asset.ethereum_address)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-xl font-semibold text-primary">
                          {formatBalance(asset.balance_formatted)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {asset.token_name} (decimals: {asset.decimals})
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">
                          Mezo token:
                        </span>
                        <a
                          href={`https://explorer.mezo.org/token/${asset.mezo_address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono break-all text-foreground underline-offset-2 hover:underline"
                        >
                          {asset.mezo_address}
                        </a>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">
                          Ethereum token:
                        </span>
                        <a
                          href={`https://etherscan.io/token/${asset.ethereum_address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono break-all text-foreground underline-offset-2 hover:underline"
                        >
                          {asset.ethereum_address}
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
