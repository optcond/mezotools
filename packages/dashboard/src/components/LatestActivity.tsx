import { History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LatestActivityTable } from "@/components/LatestActivityTable";

interface Liquidation {
  id: string;
  borrower: string;
  debt: number;
  collateral: number;
  operation: string;
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

interface LatestActivityProps {
  liquidations: Liquidation[];
  redemptions: Redemption[];
  isLoading: boolean;
  onOpenFullTable?: () => void;
}

export const LatestActivity = ({
  liquidations,
  redemptions,
  isLoading,
  onOpenFullTable,
}: LatestActivityProps) => {
  if (isLoading) {
    return (
      <Card className="glass-card p-6">
        <h2 className="text-lg font-semibold mb-4">Latest Activity</h2>
        <div className="h-64 bg-muted/20 animate-pulse rounded-xl" />
      </Card>
    );
  }

  return (
    <Card className="glass-card p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-primary">
          <History className="h-5 w-5 text-primary" />
          Latest Activity
        </h2>
      </div>
      <LatestActivityTable
        liquidations={liquidations}
        redemptions={redemptions}
        limit={5}
      />
      {onOpenFullTable ? (
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={onOpenFullTable}
          >
            Open full table
          </Button>
        </div>
      ) : null}
    </Card>
  );
};
