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

const MezoToolsLogo = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 384 384" fill="none" aria-hidden="true" {...props}>
    <rect
      x="246.192"
      y="225"
      width="95.41"
      height="13"
      transform="rotate(45 246.192 225)"
      fill="currentColor"
      className="text-primary/80"
    />
    <path
      d="M147.934 77C108.192 77 76 109.192 76 148.912C76 188.633 108.192 220.847 147.934 220.847C187.677 220.847 219.847 188.655 219.847 148.912C219.847 109.17 187.655 77 147.934 77ZM147.956 204.915C117.033 204.915 91.9757 179.857 91.9757 148.934C91.9757 118.012 117.033 92.9538 147.956 92.9538C178.879 92.9538 203.937 118.012 203.937 148.934C203.937 179.857 178.879 204.915 147.956 204.915Z"
      fill="currentColor"
      className="text-primary/80"
    />
    <path
      d="M88.6864 88.6873C121.606 55.7712 174.982 55.7712 207.898 88.6873C238.782 119.567 240.686 168.439 213.638 201.547L229.742 217.655C238.494 213.999 249.25 215.899 256.618 223.263L312.575 279.223C322.167 288.819 322.519 304.175 313.347 313.343C304.179 322.515 288.822 322.163 279.226 312.571L223.27 256.611C215.902 249.243 214.01 238.495 217.666 229.739L201.558 213.631C168.45 240.683 119.574 238.775 88.6904 207.895C55.7703 174.975 55.7703 121.603 88.6864 88.6873ZM243.566 238.031L298.203 292.671C299.007 293.471 300.059 293.875 301.115 293.875C302.167 293.875 303.215 293.471 304.023 292.671C305.627 291.063 305.627 288.459 304.023 286.855L249.386 232.219C247.782 230.611 245.178 230.611 243.57 232.219C241.958 233.823 241.958 236.427 243.566 238.031ZM103.31 193.267C128.154 218.107 168.434 218.107 193.27 193.267C218.114 168.427 218.114 128.151 193.27 103.311C168.426 78.4713 128.154 78.4713 103.31 103.311C78.4743 128.155 78.4743 168.427 103.31 193.267Z"
      fill="currentColor"
      className="text-primary"
    />
    <path
      d="M147.956 92.9538C117.033 92.9538 91.9757 118.012 91.9757 148.934C91.9757 179.857 117.033 204.915 147.956 204.915C178.879 204.915 203.937 179.857 203.937 148.934C203.937 118.012 178.879 92.9538 147.956 92.9538ZM187.458 153.114C186.954 155.937 185.97 158.564 184.613 160.905C181.768 165.807 177.281 169.528 172.007 171.432C168.177 172.81 163.932 173.248 159.643 172.482C158.242 172.219 156.863 171.847 155.572 171.388L163.888 148.956C163.888 148.956 151.217 164.078 147.125 167.405C142.923 170.863 137.583 172.854 131.915 172.854C130.536 172.854 129.114 172.723 127.691 172.482C123.424 171.716 119.638 169.878 116.53 167.274C112.219 163.663 109.264 158.629 108.302 153.027C107.842 150.335 107.82 147.534 108.323 144.689C108.827 141.866 109.812 139.24 111.168 136.898C114.013 131.996 118.5 128.275 123.774 126.371C127.604 124.993 131.849 124.555 136.139 125.321C137.539 125.584 138.918 125.956 140.209 126.415L131.893 148.847C131.893 148.847 144.564 133.725 148.657 130.398C152.858 126.94 158.198 124.949 163.866 124.949C165.267 124.949 166.667 125.08 168.09 125.321C172.357 126.087 176.143 127.925 179.251 130.529C183.562 134.14 186.517 139.174 187.48 144.776C187.939 147.468 187.961 150.269 187.458 153.114Z"
      className="text-foreground"
    />
    <path
      d="M187.48 144.776C186.495 139.174 183.54 134.119 179.251 130.508C176.143 127.903 172.357 126.065 168.09 125.299C166.667 125.036 165.267 124.927 163.866 124.927C158.198 124.927 152.858 126.919 148.657 130.376C144.586 133.725 131.893 148.825 131.893 148.825L140.209 126.393C138.918 125.912 137.539 125.54 136.139 125.299C131.849 124.533 127.604 124.949 123.774 126.35C118.522 128.253 114.013 131.974 111.168 136.876C109.812 139.218 108.827 141.844 108.323 144.667C107.82 147.512 107.842 150.313 108.302 153.005C109.286 158.607 112.241 163.663 116.53 167.252C119.638 169.856 123.424 171.694 127.691 172.46C129.114 172.723 130.514 172.832 131.915 172.832C137.583 172.832 142.923 170.841 147.125 167.383C151.195 164.035 163.888 148.934 163.888 148.934L155.572 171.366C156.863 171.847 158.242 172.219 159.643 172.46C163.932 173.226 168.177 172.81 172.007 171.41C177.26 169.506 181.768 165.785 184.613 160.883C185.97 158.542 186.954 155.916 187.458 153.092C187.961 150.247 187.939 147.446 187.48 144.754V144.776Z"
      fill="currentColor"
      className="text-primary"
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
          <div className="flex items-center gap-3">
            <MezoToolsLogo className="h-9 w-9 text-primary drop-shadow-[0_0_18px_hsl(var(--primary-glow)_/_0.25)]" />
            <h1 className="text-lg font-bold uppercase tracking-wider text-primary sm:text-xl">
              Mezo Tools
            </h1>
          </div>
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
