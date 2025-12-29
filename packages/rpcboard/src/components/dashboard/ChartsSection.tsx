import { useMemo } from "react";
import { useDashboardStore } from "@/stores/dashboardStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Trove } from "@/types/trove";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type ProcessedTrove = Trove & {
  debt: number;
  cr: number;
};

interface CollateralRatioBin {
  range: string;
  min: number;
  max: number;
  count: number;
  collateral: number;
  color: string;
}

interface ChartTooltipPayload {
  color?: string;
  name?: string;
  value?: number | string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayload[];
  label?: string | number;
}

interface TimeSeriesPoint {
  time: string;
  tcr: number;
  totalDebt: number;
  totalCollateral: number;
}

export const ChartsSection = () => {
  const { troves, btcPrice, manualBtcPrice } = useDashboardStore();

  const currentBtcPrice = manualBtcPrice || btcPrice;

  const processedTroves = useMemo<ProcessedTrove[]>(() => {
    return Array.from(troves.values()).map((trove) => {
      const debt = trove.principalDebt + trove.interest;
      const cr =
        typeof trove.icr === "number" && Number.isFinite(trove.icr)
          ? trove.icr
          : (trove.collateralBtc * currentBtcPrice) / debt;
      return { ...trove, debt, cr };
    });
  }, [troves, currentBtcPrice]);

  // CR Distribution data
  const crDistribution = useMemo<CollateralRatioBin[]>(() => {
    const bins: CollateralRatioBin[] = [
      {
        range: "< 1.2",
        min: 0,
        max: 1.2,
        count: 0,
        collateral: 0,
        color: "hsl(var(--risk-critical))",
      },
      {
        range: "1.2 - 1.5",
        min: 1.2,
        max: 1.5,
        count: 0,
        collateral: 0,
        color: "hsl(var(--risk-high))",
      },
      {
        range: "1.5 - 2.0",
        min: 1.5,
        max: 2.0,
        count: 0,
        collateral: 0,
        color: "hsl(var(--risk-medium))",
      },
      {
        range: "2.0 - 3.0",
        min: 2.0,
        max: 3.0,
        count: 0,
        collateral: 0,
        color: "hsl(var(--risk-low))",
      },
      {
        range: "> 3.0",
        min: 3.0,
        max: Infinity,
        count: 0,
        collateral: 0,
        color: "hsl(var(--risk-safe))",
      },
    ];

    processedTroves.forEach((trove) => {
      const bin = bins.find((b) => trove.cr! >= b.min && trove.cr! < b.max);
      if (bin) {
        bin.count++;
        bin.collateral += trove.collateralBtc;
      }
    });

    return bins;
  }, [processedTroves]);

  // Mock time series data (in real app this would come from historical data)
  const timeSeriesData = useMemo<TimeSeriesPoint[]>(() => {
    const hours = 24;
    const data: TimeSeriesPoint[] = [];
    const now = Date.now();

    for (let i = hours; i >= 0; i--) {
      const timestamp = now - i * 60 * 60 * 1000;
      // Mock data with some variation
      const tcrBase = 2.1;
      const variation = Math.sin(i / 6) * 0.1 + Math.random() * 0.05;
      const tcr = tcrBase + variation;

      data.push({
        time: new Date(timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        tcr: parseFloat(tcr.toFixed(3)),
        totalDebt: 15000000 + Math.random() * 1000000,
        totalCollateral: 750 + Math.random() * 50,
      });
    }

    return data;
  }, []);

  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}:{" "}
              {typeof entry.value === "number"
                ? entry.value.toLocaleString()
                : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-6 space-y-6">
      {/* CR Distribution Histogram */}
      {/* <Card className="border-border bg-gradient-to-br from-card to-muted shadow-card">
        <CardHeader>
          <CardTitle>Collateral Ratio Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={crDistribution}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
              />
              <XAxis
                dataKey="range"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="count"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card> */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* TCR Time Series */}
        <Card className="border-border bg-gradient-to-br from-card to-muted shadow-card">
          <CardHeader>
            <CardTitle>Total Collateral Ratio (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={timeSeriesData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  domain={["dataMin - 0.1", "dataMax + 0.1"]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="tcr"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Risk Distribution Pie Chart */}
        <Card className="border-border bg-gradient-to-br from-card to-muted shadow-card">
          <CardHeader>
            <CardTitle>Risk Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={crDistribution.filter((d) => d.count > 0)}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="count"
                  label={(entry: CollateralRatioBin) =>
                    `${entry.range}: ${entry.count}`
                  }
                >
                  {crDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
