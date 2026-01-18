import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AllTrovesTable } from "@/components/AllTrovesTable";
import type { Trove } from "@/hooks/useMonitorData";

interface AllTrovesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  troves: Trove[];
  isLoading: boolean;
}

export const AllTrovesSheet = ({
  open,
  onOpenChange,
  troves,
  isLoading,
}: AllTrovesSheetProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side="right"
      className="flex h-full w-full flex-col gap-4 overflow-y-auto sm:max-w-5xl"
      enableSwipeClose
      onSwipeClose={() => onOpenChange(false)}
    >
      <SheetHeader>
        <SheetTitle>All Troves</SheetTitle>
        <SheetDescription>
          Full trove list with filters, search, and CSV export.
        </SheetDescription>
      </SheetHeader>
      <AllTrovesTable
        troves={troves}
        isLoading={isLoading}
        stickyControls
        variant="sheet"
        showTitle={false}
        stickyOffsetClass="sm:top-4"
      />
    </SheetContent>
  </Sheet>
);
