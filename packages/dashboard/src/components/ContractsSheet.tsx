import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FileCode2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { TableCard, TableShell } from "@/components/TableShell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ContractsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const truncateAddress = (address: string) => {
  if (!address) {
    return "—";
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

const truncateHash = (hash: string) => {
  if (!hash) {
    return "—";
  }
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString();
};

export const ContractsSheet = ({ open, onOpenChange }: ContractsSheetProps) => {
  const [statusFilter, setStatusFilter] = useState<
    "all" | "success" | "failed"
  >("all");
  const [currentPage, setCurrentPage] = useState(1);
  const contractsPerPage = 30;
  const [totalContracts, setTotalContracts] = useState(0);

  const contractsQuery = useQuery({
    queryKey: ["contract-creations", statusFilter, currentPage],
    enabled: open,
    refetchInterval: open ? 60_000 : false,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async () => {
      const from = (currentPage - 1) * contractsPerPage;
      const to = from + contractsPerPage - 1;
      let request = supabase
        .from("contract_creations")
        .select("*", { count: "exact" })
        .order("block_number", { ascending: false })
        .order("transaction_index", { ascending: false })
        .range(from, to);

      if (statusFilter !== "all") {
        request = request.eq("tx_status", statusFilter);
      }

      const { data, error: fetchError, count } = await request;

      if (fetchError) {
        throw new Error(fetchError.message);
      }

      return { data: data ?? [], count: count ?? 0 };
    },
  });

  const contracts = contractsQuery.data?.data ?? [];
  const totalPages = Math.max(
    1,
    Math.ceil(totalContracts / contractsPerPage),
  );
  const refreshLabel = contractsQuery.dataUpdatedAt
    ? new Date(contractsQuery.dataUpdatedAt).toLocaleTimeString()
    : null;

  useEffect(() => {
    if (typeof contractsQuery.data?.count === "number") {
      setTotalContracts(contractsQuery.data.count);
    }
  }, [contractsQuery.data?.count]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageItems = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, idx) => idx + 1);
    }

    const items: Array<number | "ellipsis"> = [1];
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    if (start > 2) {
      items.push("ellipsis");
    }
    for (let page = start; page <= end; page += 1) {
      items.push(page);
    }
    if (end < totalPages - 1) {
      items.push("ellipsis");
    }
    items.push(totalPages);

    return items;
  }, [currentPage, totalPages]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-4 overflow-y-auto sm:max-w-4xl"
        enableSwipeClose
        onSwipeClose={() => onOpenChange(false)}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-primary" />
            Contracts
          </SheetTitle>
          <SheetDescription className="space-y-1 text-sm">
            <p>
              Latest contract creation transactions indexed on Mezo. Data
              refreshes every minute while this dialog is open
              {refreshLabel ? (
                <span className="text-foreground">
                  {" "}
                  · Updated {refreshLabel}
                </span>
              ) : null}
              .
            </p>
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Contract creations
              </h3>
              <p className="text-xs text-muted-foreground">
                Each row represents a contract creation transaction.
              </p>
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as "all" | "success" | "failed")
              }
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {contractsQuery.isLoading && contracts.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <Skeleton key={idx} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : contractsQuery.error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {contractsQuery.error instanceof Error
                ? contractsQuery.error.message
                : "Failed to load contract creations."}
            </div>
          ) : contracts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-card-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No contract creations matching the selected filters.
            </div>
          ) : (
            <>
              <TableShell className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Tx</TableHead>
                      <TableHead>Contract</TableHead>
                      <TableHead>Creator</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map((contract) => (
                      <TableRow key={contract.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatTimestamp(contract.block_timestamp)}
                        </TableCell>
                        <TableCell>
                          <a
                            href={`https://explorer.mezo.org/tx/${contract.tx_hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono underline-offset-2 hover:underline"
                          >
                            {truncateHash(contract.tx_hash)}
                          </a>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <a
                            href={`https://explorer.mezo.org/address/${contract.contract_address}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline-offset-2 hover:underline"
                          >
                            {truncateAddress(contract.contract_address)}
                          </a>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <a
                            href={`https://explorer.mezo.org/address/${contract.creator}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline-offset-2 hover:underline"
                          >
                            {truncateAddress(contract.creator)}
                          </a>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              contract.tx_status === "success"
                                ? "default"
                                : "destructive"
                            }
                          >
                            {contract.tx_status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableShell>
              <div className="space-y-3 md:hidden">
                {contracts.map((contract) => (
                  <TableCard key={contract.id}>
                    <div className="flex items-start justify-between gap-3">
                      <a
                        href={`https://explorer.mezo.org/tx/${contract.tx_hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs underline-offset-2 hover:underline"
                      >
                        {truncateHash(contract.tx_hash)}
                      </a>
                      <Badge
                        variant={
                          contract.tx_status === "success"
                            ? "default"
                            : "destructive"
                        }
                      >
                        {contract.tx_status}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between gap-2">
                        <span>Time</span>
                        <span className="text-foreground">
                          {formatTimestamp(contract.block_timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span>Contract</span>
                        <a
                          href={`https://explorer.mezo.org/address/${contract.contract_address}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-foreground underline-offset-2 hover:underline"
                        >
                          {truncateAddress(contract.contract_address)}
                        </a>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span>Creator</span>
                        <a
                          href={`https://explorer.mezo.org/address/${contract.creator}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-foreground underline-offset-2 hover:underline"
                        >
                          {truncateAddress(contract.creator)}
                        </a>
                      </div>
                    </div>
                  </TableCard>
                ))}
              </div>
              {totalPages > 1 ? (
                <Pagination className="pt-2">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={(event) => {
                          event.preventDefault();
                          if (currentPage > 1) {
                            setCurrentPage((page) => page - 1);
                          }
                        }}
                        className={
                          currentPage === 1
                            ? "pointer-events-none opacity-50"
                            : undefined
                        }
                      />
                    </PaginationItem>
                    {pageItems.map((item, index) =>
                      item === "ellipsis" ? (
                        <PaginationItem key={`ellipsis-${index}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={`page-${item}`}>
                          <PaginationLink
                            isActive={item === currentPage}
                            onClick={(event) => {
                              event.preventDefault();
                              setCurrentPage(item);
                            }}
                          >
                            {item}
                          </PaginationLink>
                        </PaginationItem>
                      ),
                    )}
                    <PaginationItem>
                      <PaginationNext
                        onClick={(event) => {
                          event.preventDefault();
                          if (currentPage < totalPages) {
                            setCurrentPage((page) => page + 1);
                          }
                        }}
                        className={
                          currentPage === totalPages
                            ? "pointer-events-none opacity-50"
                            : undefined
                        }
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
