import { useState, useMemo } from "react";
import {
  Search,
  Download,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Vault,
  Copy,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/formatNumber";

interface Trove {
  id: string;
  owner: string;
  collateral: number;
  principal_debt: number;
  interest: number;
  collaterization_ratio: number;
}

interface AllTrovesProps {
  troves: Trove[];
  isLoading: boolean;
}

type PresetFilter =
  | "all"
  | "critical"
  | "high"
  | "medium"
  | "safe"
  | "watchlist";
type SortField =
  | "owner"
  | "collateral"
  | "principal_debt"
  | "collaterization_ratio";
type SortOrder = "asc" | "desc";

const truncateAddress = (address: string) => {
  if (address.length <= 12) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
};

export const AllTroves = ({ troves, isLoading }: AllTrovesProps) => {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<PresetFilter>("all");
  const [sortField, setSortField] = useState<SortField>(
    "collaterization_ratio"
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [watchlist, setWatchlist] = useState<Set<string>>(
    new Set(JSON.parse(localStorage.getItem("troveWatchlist") || "[]"))
  );

  const toggleWatchlist = (owner: string) => {
    const newWatchlist = new Set(watchlist);
    if (newWatchlist.has(owner)) {
      newWatchlist.delete(owner);
      toast({ title: "Removed from watchlist" });
    } else {
      newWatchlist.add(owner);
      toast({ title: "Added to watchlist" });
    }
    setWatchlist(newWatchlist);
    localStorage.setItem("troveWatchlist", JSON.stringify([...newWatchlist]));
  };

  const filteredTroves = useMemo(() => {
    let result = troves;

    // Apply search filter
    if (search) {
      result = result.filter((t) =>
        t.owner.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Apply preset filter
    if (preset === "critical") {
      result = result.filter((t) => t.collaterization_ratio < 1.2);
    } else if (preset === "high") {
      result = result.filter(
        (t) => t.collaterization_ratio >= 1.2 && t.collaterization_ratio < 1.6
      );
    } else if (preset === "medium") {
      result = result.filter(
        (t) => t.collaterization_ratio >= 1.6 && t.collaterization_ratio < 2.0
      );
    } else if (preset === "safe") {
      result = result.filter((t) => t.collaterization_ratio >= 2.0);
    } else if (preset === "watchlist") {
      result = result.filter((t) => watchlist.has(t.owner));
    }

    // Apply sorting
    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const multiplier = sortOrder === "asc" ? 1 : -1;

      if (typeof aVal === "string" && typeof bVal === "string") {
        return aVal.localeCompare(bVal) * multiplier;
      }
      return ((aVal as number) - (bVal as number)) * multiplier;
    });

    return result;
  }, [troves, search, preset, sortField, sortOrder, watchlist]);

  const getCrColor = (cr: number) => {
    if (cr < 1.2) return "text-critical";
    if (cr < 1.6) return "text-high";
    if (cr < 2.0) return "text-elevated";
    return "text-safe";
  };

  const getCrBadge = (cr: number) => {
    if (cr < 1.2) return <Badge variant="destructive">Critical</Badge>;
    if (cr < 1.6) return <Badge className="bg-high text-white">High</Badge>;
    if (cr < 2.0)
      return <Badge className="bg-elevated text-black">Elevated</Badge>;
    return <Badge className="bg-safe text-white">Safe</Badge>;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const exportCSV = () => {
    const headers = [
      "Owner",
      "Collateral (BTC)",
      "Debt (MUSD)",
      "Interest (MUSD)",
      "CR",
    ];
    const rows = filteredTroves.map((t) => [
      t.owner,
      t.collateral.toFixed(8),
      t.principal_debt.toFixed(2),
      t.interest.toFixed(2),
      t.collaterization_ratio.toFixed(4),
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "troves.csv";
    a.click();

    toast({ title: "CSV exported successfully" });
  };

  const copyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      toast({ title: "Address copied" });
    } catch {
      toast({ title: "Failed to copy address", variant: "destructive" });
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === "asc" ? (
      <ChevronUp className="h-4 w-4" />
    ) : (
      <ChevronDown className="h-4 w-4" />
    );
  };

  if (isLoading) {
    return (
      <Card className="glass-card p-6">
        <h2 className="text-lg font-semibold mb-4">All Troves</h2>
        <div className="h-96 bg-muted/20 animate-pulse rounded-xl" />
      </Card>
    );
  }

  return (
    <Card className="glass-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-primary">
        <Vault className="h-5 w-5 text-primary" />
        All Troves
      </h2>

      {/* Controls */}
      <div className="space-y-4 mb-6">
        {/* Search and export */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search owner address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            onClick={exportCSV}
            variant="outline"
            className="w-full gap-2 sm:w-auto"
          >
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>

        {/* Preset filters */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              "all",
              "critical",
              "high",
              "medium",
              "safe",
              "watchlist",
            ] as PresetFilter[]
          ).map((p) => (
            <Button
              key={p}
              variant={preset === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPreset(p)}
              className="capitalize"
            >
              {p}
              {p === "watchlist" && watchlist.size > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {formatNumber(watchlist.size)}
                </Badge>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block border border-card-border/40 rounded-xl overflow-hidden">
        <div className="max-h-[560px] overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-card-border">
                <th className="text-left p-3 text-sm font-semibold">
                  <button
                    onClick={() => handleSort("owner")}
                    className="flex items-center gap-1 hover:text-primary transition-smooth"
                  >
                    Owner
                    <SortIcon field="owner" />
                  </button>
                </th>
                <th className="text-right p-3 text-sm font-semibold">
                  <button
                    onClick={() => handleSort("collateral")}
                    className="flex items-center gap-1 ml-auto hover:text-primary transition-smooth"
                  >
                    Collateral
                    <SortIcon field="collateral" />
                  </button>
                </th>
                <th className="text-right p-3 text-sm font-semibold">
                  <button
                    onClick={() => handleSort("principal_debt")}
                    className="flex items-center gap-1 ml-auto hover:text-primary transition-smooth"
                  >
                    Debt
                    <SortIcon field="principal_debt" />
                  </button>
                </th>
                <th className="text-right p-3 text-sm font-semibold">
                  Interest
                </th>
                <th className="text-right p-3 text-sm font-semibold">
                  <button
                    onClick={() => handleSort("collaterization_ratio")}
                    className="flex items-center gap-1 ml-auto hover:text-primary transition-smooth"
                  >
                    CR
                    <SortIcon field="collaterization_ratio" />
                  </button>
                </th>
                <th className="text-center p-3 text-sm font-semibold">
                  Health
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTroves.map((trove) => (
                <tr
                  key={trove.id}
                  className="border-b border-card-border/40 hover:bg-card/30 transition-smooth"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://explorer.mezo.org/address/${trove.owner}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm text-primary hover:underline break-all"
                      >
                        {truncateAddress(trove.owner)}
                      </a>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={() => copyAddress(trove.owner)}
                          aria-label="Copy address"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleWatchlist(trove.owner)}
                          className="h-7 w-7"
                          aria-label={
                            watchlist.has(trove.owner)
                              ? "Remove from watchlist"
                              : "Add to watchlist"
                          }
                        >
                          {watchlist.has(trove.owner) ? (
                            <Eye className="h-4 w-4 text-primary" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-right font-medium">
                    {formatNumber(trove.collateral, {
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 4,
                    })}{" "}
                    BTC
                  </td>
                  <td className="p-3 text-right">
                    {formatNumber(trove.principal_debt, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    MUSD
                  </td>
                  <td className="p-3 text-right text-sm text-muted-foreground">
                    {formatNumber(trove.interest, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    MUSD
                  </td>
                  <td
                    className={`p-3 text-right font-bold ${getCrColor(
                      trove.collaterization_ratio
                    )}`}
                  >
                    {formatNumber(trove.collaterization_ratio * 100, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                    %
                  </td>
                  <td className="p-3 text-center">
                    {getCrBadge(trove.collaterization_ratio)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredTroves.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No troves found. Adjust filters or verify Supabase seed.
            </div>
          )}
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="space-y-3 md:hidden">
        {filteredTroves.map((trove) => (
          <div
            key={trove.id}
            className="p-4 rounded-lg bg-card/30 border border-card-border/40"
          >
            <div className="flex items-start justify-between mb-3 gap-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <a
                    href={`https://explorer.mezo.org/address/${trove.owner}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm text-primary hover:underline break-all"
                  >
                    {truncateAddress(trove.owner)}
                  </a>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => copyAddress(trove.owner)}
                      aria-label="Copy address"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleWatchlist(trove.owner)}
                      className="h-7 w-7"
                      aria-label={
                        watchlist.has(trove.owner)
                          ? "Remove from watchlist"
                          : "Add to watchlist"
                      }
                    >
                      {watchlist.has(trove.owner) ? (
                        <Eye className="h-4 w-4 text-primary" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
              {getCrBadge(trove.collaterization_ratio)}
            </div>
            <div className="grid grid-cols-1 gap-2 text-sm mb-3 sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Collateral:</span>{" "}
                <span className="font-medium">
                  {formatNumber(trove.collateral, {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4,
                  })}{" "}
                  BTC
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Debt:</span>{" "}
                <span className="font-medium">
                  {formatNumber(trove.principal_debt, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  MUSD
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Interest:</span>{" "}
                <span>
                  {formatNumber(trove.interest, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{" "}
                  MUSD
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">CR:</span>{" "}
                <span
                  className={`font-bold ${getCrColor(
                    trove.collaterization_ratio
                  )}`}
                >
                  {formatNumber(trove.collaterization_ratio * 100, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                  %
                </span>
              </div>
            </div>
          </div>
        ))}

        {filteredTroves.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No troves found. Adjust filters or verify Supabase seed.
          </div>
        )}
      </div>
    </Card>
  );
};
