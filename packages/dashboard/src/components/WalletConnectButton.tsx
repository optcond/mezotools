import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type WalletConnectButtonProps = {
  connectLabel?: string;
  connectedLabel?: string;
  wrongNetworkLabel?: string;
  connectVariant?: ButtonProps["variant"];
  connectedVariant?: ButtonProps["variant"];
  wrongNetworkVariant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  onModalOpen?: (type: "connect" | "account" | "chain") => void;
};

export const WalletConnectButton = ({
  connectLabel = "Connect wallet",
  connectedLabel = "Manage wallet",
  wrongNetworkLabel = "Switch network",
  connectVariant = "default",
  connectedVariant = "outline",
  wrongNetworkVariant = "destructive",
  size = "default",
  className,
  onModalOpen,
}: WalletConnectButtonProps) => (
  <ConnectButton.Custom>
    {({
      account,
      chain,
      mounted,
      authenticationStatus,
      openAccountModal,
      openChainModal,
      openConnectModal,
    }) => {
      const ready = mounted && authenticationStatus !== "loading";
      const connected =
        ready &&
        account &&
        chain &&
        (!authenticationStatus || authenticationStatus === "authenticated");
      const wrongNetwork = connected && chain.unsupported;
      const label = wrongNetwork
        ? wrongNetworkLabel
        : connected
        ? connectedLabel
        : connectLabel;
      const variant = wrongNetwork
        ? wrongNetworkVariant
        : connected
        ? connectedVariant
        : connectVariant;

      const handleClick = () => {
        if (!ready) {
          return;
        }
        if (!connected) {
          onModalOpen?.("connect");
          openConnectModal?.();
          return;
        }
        if (wrongNetwork) {
          onModalOpen?.("chain");
          openChainModal?.();
          return;
        }
        onModalOpen?.("account");
        openAccountModal?.();
      };

      return (
        <div
          className={cn(
            !ready && "pointer-events-none select-none opacity-0"
          )}
          {...(!ready && { "aria-hidden": true })}
        >
          <Button
            type="button"
            variant={variant}
            size={size}
            className={className}
            onClick={handleClick}
            disabled={!ready}
          >
            {label}
          </Button>
        </div>
      );
    }}
  </ConnectButton.Custom>
);
