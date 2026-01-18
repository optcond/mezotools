import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LiquidationsRedemptionsTable } from "@/components/LiquidationsRedemptionsTable";

interface Liquidation {
  id: string;
  borrower: string;
  debt: number;
  collateral: number;
  tx_hash: string;
  block_number: number;
  block_timestamp: string;
}

interface Redemption {
  id: string;
  attempted_amount: number;
  actual_amount: number;
  collateral_sent: number;
  collateral_fee: number;
  affected_borrowers: string[] | null;
  tx_hash: string;
  block_number: number;
  block_timestamp: string;
}

interface LiquidationsRedemptionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  liquidations: Liquidation[];
  redemptions: Redemption[];
  isLoading: boolean;
}

export const LiquidationsRedemptionsSheet = ({
  open,
  onOpenChange,
  liquidations,
  redemptions,
  isLoading,
}: LiquidationsRedemptionsSheetProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side="right"
      className="flex h-full w-full flex-col gap-4 overflow-y-auto sm:max-w-5xl"
      enableSwipeClose
      onSwipeClose={() => onOpenChange(false)}
    >
      <SheetHeader>
        <SheetTitle>Liquidations & Redemptions</SheetTitle>
        <SheetDescription>
          Latest 50 liquidations and redemptions, refreshed with each indexer
          update.
        </SheetDescription>
      </SheetHeader>
      {isLoading ? (
        <div className="h-64 rounded-xl bg-muted/20 animate-pulse" />
      ) : (
        <LiquidationsRedemptionsTable
          liquidations={liquidations}
          redemptions={redemptions}
          limit={50}
        />
      )}
    </SheetContent>
  </Sheet>
);
