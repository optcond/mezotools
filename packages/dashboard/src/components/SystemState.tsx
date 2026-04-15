import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Coins,
  CircleDollarSign,
  Gauge,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatNumber } from "@/lib/formatNumber";
import { usePriceFeedHistory } from "@/hooks/usePriceFeedHistory";

const TCR_CHART_STORAGE_KEY = "mezo-chart-collapse-system-state";

interface SystemStateProps {
  tcr: number;
  mezoUsdPrice: number | null;
  totalCollateral: number;
  totalDebt: number;
  totalTroves: number;
  chartData: Array<{ date: string; tcr: number; btcPrice: number }>;
  isLoading: boolean;
}

const MetricTile = ({ 
  label, 
  value, 
  subtitle, 
  borderColor, 
  icon: Icon 
}: { 
  label: string; 
  value: string; 
  subtitle: string; 
  borderColor: string;
  icon?: React.ElementType;
}) => (
  <div className={`relative w-full p-4 rounded-xl bg-card/40 border-l-4 ${borderColor} min-w-[180px]`}>
    {Icon && <Icon className="absolute top-3 right-3 h-5 w-5 text-muted-foreground/40" />}
    <div className="text-sm text-muted-foreground mb-1">{label}</div>
    <div className="text-2xl font-bold mb-1">{value}</div>
    <div className="text-xs text-muted-foreground">{subtitle}</div>
  </div>
);

export const SystemState = ({ 
  tcr, 
  mezoUsdPrice, 
  totalCollateral,
  totalDebt, 
  totalTroves,
  chartData,
  isLoading 
}: SystemStateProps) => {
  const { stats: musdStats } = usePriceFeedHistory({
    source: "musd_usdc",
    hours: 24,
    limit: 300,
  });
  const musdPrice =
    musdStats.latestPrice !== null ? musdStats.latestPrice / 100000 : null;
  const musdLabel =
    musdPrice !== null && Number.isFinite(musdPrice)
      ? `$${musdPrice.toLocaleString(undefined, {
          minimumFractionDigits: 4,
          maximumFractionDigits: 4,
        })}`
      : "—";
  const mezoLabel =
    mezoUsdPrice !== null && Number.isFinite(mezoUsdPrice)
      ? `$${mezoUsdPrice.toLocaleString(undefined, {
          minimumFractionDigits: 4,
          maximumFractionDigits: 6,
        })}`
      : "—";

  const [isChartCollapsed, setIsChartCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      return window.localStorage.getItem(TCR_CHART_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        TCR_CHART_STORAGE_KEY,
        String(isChartCollapsed)
      );
    } catch {
      // Ignore storage failures (private mode or disabled storage).
    }
  }, [isChartCollapsed]);

  const getTcrColor = (value: number) => {
    if (value < 1.2) return "border-critical";
    if (value < 1.6) return "border-high";
    if (value < 2.0) return "border-elevated";
    return "border-primary";
  };

  if (isLoading) {
    return (
      <Card className="glass-card p-6">
        <h2 className="text-lg font-semibold mb-4">System State</h2>
        <div className="space-y-4">
          <div className="h-24 bg-muted/20 animate-pulse rounded-xl" />
          <div className="h-64 bg-muted/20 animate-pulse rounded-xl" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="glass-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-primary">
        <LayoutDashboard className="h-5 w-5 text-primary" />
        System State
      </h2>

      {/* Metric tiles */}
      <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2 lg:grid-cols-3">
        <MetricTile
          label="Total Troves"
          value={totalTroves.toLocaleString()}
          subtitle="Active positions"
          borderColor="border-primary"
          icon={Users}
        />
        <MetricTile
          label="Total Collateral"
          value={`${totalCollateral.toFixed(2)} BTC`}
          subtitle="System-wide"
          borderColor="border-primary"
          icon={Coins}
        />
        <MetricTile
          label="Total Debt"
          value={`${formatNumber(totalDebt, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} MUSD`}
          subtitle="System-wide"
          borderColor="border-primary"
          icon={CircleDollarSign}
        />
        <MetricTile
          label="TCR"
          value={`${(tcr * 100).toFixed(1)}%`}
          subtitle="Total Collateral Ratio"
          borderColor={getTcrColor(tcr)}
          icon={Gauge}
        />
        <MetricTile
          label="MEZO / USD"
          value={mezoLabel}
          subtitle="Pyth feed"
          borderColor="border-primary"
          icon={CircleDollarSign}
        />
        <MetricTile
          label="MUSD / USDC"
          value={musdLabel}
          subtitle="Latest price"
          borderColor="border-primary"
          icon={CircleDollarSign}
        />
      </div>

      {/* TCR Historic Chart */}
      <div className="bg-card/40 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-muted-foreground">
            30-Day TCR History
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsChartCollapsed((prev) => !prev)}
          >
            {isChartCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
            <span className="sr-only">
              {isChartCollapsed ? "Show chart" : "Hide chart"}
            </span>
          </Button>
        </div>
        {isChartCollapsed ? (
          <div className="text-xs text-muted-foreground">
            Chart hidden.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.3}
              />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                domain={[
                  (dataMin: number) => dataMin * 0.9,
                  (dataMax: number) => dataMax * 1.1,
                ]}
                tickFormatter={(value: number) => value.toFixed(2)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                }}
                formatter={(value: number, name: string) => {
                  if (name === "tcr")
                    return [`${(value * 100).toFixed(2)}%`, "TCR"];
                  return [`$${value.toLocaleString()}`, "BTC Price"];
                }}
              />
              <Line
                type="monotone"
                dataKey="tcr"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
};
