import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TableShellProps {
  children: ReactNode;
  className?: string;
}

export const TableShell = ({ children, className }: TableShellProps) => (
  <div
    className={cn(
      "rounded-xl border border-card-border/60 bg-card/20",
      className
    )}
  >
    {children}
  </div>
);

export const TableCard = ({ children, className }: TableShellProps) => (
  <div
    className={cn(
      "rounded-xl border border-card-border/60 bg-muted/20 p-4",
      className
    )}
  >
    {children}
  </div>
);
