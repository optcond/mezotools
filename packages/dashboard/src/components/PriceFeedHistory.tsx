import { useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePriceFeedHistory } from "@/hooks/usePriceFeedHistory";
import { cn } from "@/lib/utils";

interface PriceFeedTabConfig {
  value: string;
  label: string;
  source: string;
  hours: number;
  limit?: number;
  priceDivisor?: number;
  heading: string;
  changeLabel: string;
  highLabel: string;
  lowLabel: string;
  emptyMessage: string;
}

const PRICE_FEED_TABS: PriceFeedTabConfig[] = [
  {
    value: "musd-1d",
    label: "MUSD feed · 24H",
    source: "musd_usdc",
    hours: 24,
    limit: 300,
    priceDivisor: 100000,
    heading: "MUSD / USDC 100k sell order (Last 24 Hours)",
    changeLabel: "24h Change",
    highLabel: "24h High",
    lowLabel: "24h Low",
    emptyMessage: "No price feed updates recorded in the last 24 hours.",
  },
  {
    value: "musd-30d",
    label: "MUSD feed · 30D",
    source: "musd_usdc_4h",
    hours: (24 / 4) * 30,
    limit: 300,
    priceDivisor: 100000,
    heading: "MUSD / USDC 100k sell order (Last 30 Days)",
    changeLabel: "30d Change",
    highLabel: "30d High",
    lowLabel: "30d Low",
    emptyMessage: "No price feed updates recorded in the last 30 days.",
  },
  {
    value: "btc",
    label: "BTC feed · 24H",
    source: "btc_oracle",
    hours: 24,
    limit: 300,
    heading: "BTC Price Feed (Last 24 Hours)",
    changeLabel: "24h Change",
    highLabel: "24h High",
    lowLabel: "24h Low",
    emptyMessage: "No BTC price feed updates recorded in the past 4 hours.",
  },
];

const getFractionDigits = (value: number) => {
  const abs = Math.abs(value);

  if (abs >= 1000) {
    return { min: 0, max: 0 };
  }

  if (abs >= 10) {
    return { min: 2, max: 2 };
  }

  if (abs >= 1) {
    return { min: 2, max: 4 };
  }

  if (abs >= 0.01) {
    return { min: 4, max: 6 };
  }

  return { min: 6, max: 6 };
};

const formatPrice = (value: number | null) => {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }

  const { min, max } = getFractionDigits(value);

  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })}`;
};

const formatTooltipPrice = (value: number) => {
  const { min, max } = getFractionDigits(value);

  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })}`;
};

const formatAxisPrice = (value: number) => {
  const { max } = getFractionDigits(value);

  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.max(0, max),
  })}`;
};

const formatChange = (value: number | null, percent: number | null) => {
  if (
    value === null ||
    percent === null ||
    Number.isNaN(value) ||
    Number.isNaN(percent)
  ) {
    return "—";
  }

  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const absolute = Math.abs(value);
  const { min, max } = getFractionDigits(absolute);
  const absolutePercent = Math.abs(percent);

  return `${sign}$${absolute.toLocaleString("en-US", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })} (${sign}${absolutePercent.toFixed(2)}%)`;
};

const formatTimestamp = (timestamp: string | null) => {
  if (!timestamp) {
    return null;
  }
  const date = new Date(timestamp);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatAxisLabel = (timestamp: string, hours: number) => {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  if (hours >= 24 * 14) {
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  }

  if (hours >= 24) {
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const StatTile = ({
  label,
  value,
  helper,
  accent,
}: {
  label: string;
  value: string;
  helper?: string | null;
  accent?: "positive" | "negative";
}) => {
  const accentClass =
    accent === "positive"
      ? "text-safe"
      : accent === "negative"
      ? "text-critical"
      : "text-foreground";

  return (
    <div className="p-4 rounded-xl bg-card/40 border border-border/40">
      <div className="text-xs uppercase tracking-[0.08em] text-muted-foreground mb-1">
        {label}
      </div>
      <div className={cn("text-2xl font-semibold", accentClass)}>{value}</div>
      {helper ? (
        <div className="text-xs text-muted-foreground mt-1">{helper}</div>
      ) : null}
    </div>
  );
};

const PriceFeedTabContent = ({ tab }: { tab: PriceFeedTabConfig }) => {
  const { pricePoints, stats, isLoading, isFetching, error } =
    usePriceFeedHistory({
      source: tab.source,
      hours: tab.hours,
      limit: tab.limit,
    });
  const priceDivisor = tab.priceDivisor ?? 1;
  const scaleValue = (value: number | null) =>
    value === null ? null : value / priceDivisor;
  const scaledLatestPrice = scaleValue(stats.latestPrice);
  const scaledChange = scaleValue(stats.change);
  const scaledHigh = scaleValue(stats.high);
  const scaledLow = scaleValue(stats.low);

  const chartData = pricePoints.map((point) => ({
    time: formatAxisLabel(point.timestamp, tab.hours),
    price: point.price / priceDivisor,
    blockNumber: point.blockNumber,
    timestamp: point.timestamp,
  }));

  if (isLoading && pricePoints.length === 0) {
    return (
      <TabsContent value={tab.value} className="mt-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-6 w-32 rounded bg-muted/20 animate-pulse" />
            <div className="h-6 w-20 rounded bg-muted/20 animate-pulse" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-20 bg-muted/20 animate-pulse rounded-xl"
              />
            ))}
          </div>
          <div className="h-64 bg-muted/20 animate-pulse rounded-xl" />
        </div>
      </TabsContent>
    );
  }

  const changeAccent =
    scaledChange && scaledChange !== 0
      ? scaledChange > 0
        ? "positive"
        : "negative"
      : undefined;
  const ChangeIcon =
    scaledChange && scaledChange !== 0
      ? scaledChange > 0
        ? ArrowUpRight
        : ArrowDownRight
      : null;
  const lastUpdatedLabel = formatTimestamp(stats.lastUpdated);

  return (
    <TabsContent value={tab.value} className="mt-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {stats.latestBlockNumber !== null && (
          <Badge variant="outline" className="border-primary/40 text-primary">
            Block {stats.latestBlockNumber.toLocaleString()}
          </Badge>
        )}
        {error ? null : isFetching ? (
          <span className="animate-pulse">Updating…</span>
        ) : lastUpdatedLabel ? (
          <span>Updated {lastUpdatedLabel}</span>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>
            Unable to load price feed history: {error.message}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <StatTile
          label="Latest Price"
          value={formatPrice(scaledLatestPrice)}
          helper="Oracle price"
        />
        <StatTile
          label={tab.changeLabel}
          value={formatChange(scaledChange, stats.percentChange)}
          helper="Net move over the window"
          accent={changeAccent}
        />
        <StatTile
          label={tab.highLabel}
          value={formatPrice(scaledHigh)}
          helper="Peak oracle price"
        />
        <StatTile
          label={tab.lowLabel}
          value={formatPrice(scaledLow)}
          helper="Trough oracle price"
        />
      </div>

      <div className="bg-card/40 rounded-xl p-4 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Oracle Price by Block
          </h3>
          {ChangeIcon ? (
            <div
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                changeAccent === "positive" ? "text-safe" : "text-critical"
              )}
            >
              <ChangeIcon className="h-4 w-4" />
              {formatChange(scaledChange, stats.percentChange)}
            </div>
          ) : null}
        </div>
        {error ? null : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.3}
              />
              <XAxis
                dataKey="time"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                domain={["auto", "auto"]}
                tickFormatter={formatAxisPrice}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                }}
                labelFormatter={(_, payload) => {
                  const item = payload?.[0]?.payload as
                    | (typeof chartData)[number]
                    | undefined;
                  if (!item) {
                    return "";
                  }
                  const timestamp = formatTimestamp(item.timestamp);
                  return timestamp
                    ? `${timestamp} • Block ${item.blockNumber.toLocaleString()}`
                    : "";
                }}
                formatter={(value: number) => [
                  formatTooltipPrice(value),
                  "Price",
                ]}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
            {tab.emptyMessage}
          </div>
        )}
      </div>
    </TabsContent>
  );
};

export const PriceFeedHistory = () => {
  const [activeTab, setActiveTab] = useState<string>(PRICE_FEED_TABS[0].value);
  const activeConfig =
    PRICE_FEED_TABS.find((tab) => tab.value === activeTab) ??
    PRICE_FEED_TABS[0];

  return (
    <Card className="glass-card p-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Activity className="h-5 w-5" />
            <h2 className="text-lg font-semibold">{activeConfig.heading}</h2>
          </div>
          <TabsList className="order-last -mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto bg-transparent p-0 lg:order-none lg:mx-0 lg:flex-wrap lg:bg-muted/10 lg:p-1">
            {PRICE_FEED_TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex-none whitespace-nowrap px-3 py-2 text-xs sm:text-sm"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {PRICE_FEED_TABS.map((tab) => (
          <PriceFeedTabContent key={tab.value} tab={tab} />
        ))}
      </Tabs>
    </Card>
  );
};
