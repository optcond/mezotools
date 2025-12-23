import { useState, useMemo } from "react";
import { useDashboardStore } from "@/stores/dashboardStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Eye,
  EyeOff,
  Copy,
} from "lucide-react";
import { Trove } from "@/types/trove";
import copy from "copy-to-clipboard";
import { useToast } from "@/hooks/use-toast";

type SortField = "cr" | "debt" | "collateralBtc" | "owner";
type SortDirection = "asc" | "desc";
type ProcessedTrove = Trove & { debt: number; cr: number };

export const TrovesTable = () => {
  const {
    troves,
    btcPrice,
    manualBtcPrice,
    watchlist,
    addToWatchlist,
    removeFromWatchlist,
  } = useDashboardStore();

  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("cr");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filterPreset, setFilterPreset] = useState<
    "all" | "critical" | "high" | "medium" | "watchlist"
  >("all");

  const currentBtcPrice = manualBtcPrice || btcPrice;

  const processedTroves = useMemo<ProcessedTrove[]>(() => {
    return Array.from(troves.values()).map((trove) => {
      const debt = trove.principalDebt + trove.interest;
      const cr = (trove.collateralBtc * currentBtcPrice) / debt;
      return { ...trove, debt, cr };
    });
  }, [troves, currentBtcPrice]);

  const filteredTroves = useMemo(() => {
    let filtered: ProcessedTrove[] = [...processedTroves];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter((trove) =>
        trove.owner.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply preset filter
    switch (filterPreset) {
      case "critical":
        filtered = filtered.filter((trove) => trove.cr < 1.2);
        break;
      case "high":
        filtered = filtered.filter((trove) => trove.cr < 1.5);
        break;
      case "medium":
        filtered = filtered.filter((trove) => trove.cr < 2.0);
        break;
      case "watchlist":
        filtered = filtered.filter((trove) => watchlist.has(trove.owner));
        break;
    }

    // Apply sorting
    const getComparableValue = (trove: ProcessedTrove): number | string => {
      switch (sortField) {
        case "owner":
          return trove.owner.toLowerCase();
        case "collateralBtc":
          return trove.collateralBtc;
        case "debt":
          return trove.debt;
        case "cr":
        default:
          return trove.cr;
      }
    };

    filtered.sort((a, b) => {
      const aValue = getComparableValue(a);
      const bValue = getComparableValue(b);

      if (sortDirection === "asc") {
        if (aValue < bValue) return -1;
        if (aValue > bValue) return 1;
        return 0;
      }
      if (aValue > bValue) return -1;
      if (aValue < bValue) return 1;
      return 0;
    });

    return [...filtered];
  }, [
    processedTroves,
    searchTerm,
    filterPreset,
    sortField,
    sortDirection,
    watchlist,
  ]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="h-4 w-4" />
    ) : (
      <ArrowDown className="h-4 w-4" />
    );
  };

  const getRiskColor = (cr: number) => {
    if (cr < 1.2) return "text-risk-critical";
    if (cr < 1.5) return "text-risk-high";
    if (cr < 2.0) return "text-risk-medium";
    return "text-risk-safe";
  };

  const getRiskBadge = (cr: number) => {
    if (cr < 1.2) return <Badge variant="destructive">Critical</Badge>;
    if (cr < 1.5)
      return <Badge className="bg-risk-high text-white">High</Badge>;
    if (cr < 2.0)
      return <Badge className="bg-risk-medium text-white">Medium</Badge>;
    return <Badge className="bg-risk-safe text-white">Safe</Badge>;
  };

  const handleCopyAddress = (address: string) => {
    copy(address);
    toast({
      title: "Address copied",
      description: "Trove owner address copied to clipboard",
    });
  };

  const handleToggleWatchlist = (owner: string) => {
    if (watchlist.has(owner)) {
      removeFromWatchlist(owner);
      toast({
        title: "Removed from watchlist",
        description: `${owner.slice(0, 8)}... removed from watchlist`,
      });
    } else {
      addToWatchlist(owner);
      toast({
        title: "Added to watchlist",
        description: `${owner.slice(0, 8)}... added to watchlist`,
      });
    }
  };

  const formatBTC = (value: number) => value.toFixed(8);
  const formatUSD = (value: number) => value.toFixed(2);
  const formatCR = (value: number) => value.toFixed(3);

  const handleExportCsv = () => {
    if (filteredTroves.length === 0) {
      toast({
        title: "No troves to export",
        description: "Adjust filters to include at least one trove.",
      });
      return;
    }

    const headers = [
      "Owner",
      "Collateral (BTC)",
      "Debt (MUSD)",
      "Interest (MUSD)",
      "CR",
    ];

    const rows = filteredTroves.map((trove) => {
      const debtValue = trove.debt;
      return [
        trove.owner,
        formatBTC(trove.collateralBtc),
        formatUSD(debtValue),
        formatUSD(trove.interest),
        formatCR(trove.cr),
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `troves-${filteredTroves.length}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "CSV exported",
      description: `Saved ${filteredTroves.length} troves`,
    });
  };

  return (
    <div className="p-6">
      <Card className="border-border bg-gradient-to-br from-card to-muted shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Troves ({filteredTroves.length})</CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          {/* Filters and Search */}
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by owner address..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex space-x-2">
              {(
                ["all", "critical", "high", "medium", "watchlist"] as const
              ).map((preset) => (
                <Button
                  key={preset}
                  variant={filterPreset === preset ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterPreset(preset)}
                  className="capitalize"
                >
                  {preset === "all" ? "All" : preset}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-auto max-h-96">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted border-b">
                <tr>
                  <th className="text-left p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("owner")}
                      className="h-auto p-0 font-medium"
                    >
                      Owner {getSortIcon("owner")}
                    </Button>
                  </th>
                  <th className="text-right p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("collateralBtc")}
                      className="h-auto p-0 font-medium"
                    >
                      Collateral {getSortIcon("collateralBtc")}
                    </Button>
                  </th>
                  <th className="text-right p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("debt")}
                      className="h-auto p-0 font-medium"
                    >
                      Debt {getSortIcon("debt")}
                    </Button>
                  </th>
                  <th className="text-right p-3">Interest</th>
                  <th className="text-right p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("cr")}
                      className="h-auto p-0 font-medium"
                    >
                      CR {getSortIcon("cr")}
                    </Button>
                  </th>
                  <th className="text-center p-3">Health</th>
                  <th className="text-center p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTroves.map((trove) => (
                  <tr
                    key={trove.owner}
                    className="border-b border-border hover:bg-muted/50"
                  >
                    <td className="p-3">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm">
                          {trove.owner.slice(0, 8)}...{trove.owner.slice(-4)}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyAddress(trove.owner)}
                          className="h-6 w-6 p-0"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono">
                      {formatBTC(trove.collateralBtc)} BTC
                    </td>
                    <td className="p-3 text-right font-mono">
                      ${formatUSD(trove.debt)} MUSD
                    </td>
                    <td className="p-3 text-right font-mono text-sm text-muted-foreground">
                      ${formatUSD(trove.interest)}
                    </td>
                    <td
                      className={`p-3 text-right font-mono font-bold ${getRiskColor(
                        trove.cr
                      )}`}
                    >
                      {formatCR(trove.cr)}
                    </td>
                    <td className="p-3 text-center">
                      {getRiskBadge(trove.cr)}
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleWatchlist(trove.owner)}
                        className="h-6 w-6 p-0"
                      >
                        {watchlist.has(trove.owner) ? (
                          <Eye className="h-3 w-3 text-primary" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredTroves.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No troves found matching your criteria
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
