import { useDashboardStore } from "@/stores/dashboardStore";
import { MetricCard } from "./MetricCard";
import {
  Coins,
  TrendingUp,
  AlertTriangle,
  Shield,
  DollarSign,
  Activity,
} from "lucide-react";

export const MetricsGrid = () => {
  const { metrics } = useDashboardStore();

  const formatBTC = (value: number) => {
    return value.toFixed(8) + " BTC";
  };

  const formatUSD = (value: number) => {
    return (
      "$" +
      value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  };

  const formatRatio = (value: number) => {
    return value.toFixed(3);
  };

  const getTcrVariant = (tcr: number) => {
    if (tcr < 1.2) return "critical";
    if (tcr < 1.5) return "warning";
    return "success";
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 p-6">
      <MetricCard
        title="Total Troves"
        value={metrics.totalTroves}
        icon={<Activity className="h-4 w-4" />}
        subtitle="Active positions"
      />

      <MetricCard
        title="Total Collateral"
        value={formatBTC(metrics.totalCollateral)}
        icon={<Coins className="h-4 w-4" />}
        subtitle="Locked BTC"
        variant="default"
      />

      <MetricCard
        title="Total Debt"
        value={formatUSD(metrics.totalDebt)}
        icon={<DollarSign className="h-4 w-4" />}
        subtitle="Outstanding MUSD"
      />

      <MetricCard
        title="TCR"
        value={formatRatio(metrics.tcr)}
        icon={<TrendingUp className="h-4 w-4" />}
        subtitle="Total Collateral Ratio"
        variant={getTcrVariant(metrics.tcr)}
      />

      <MetricCard
        title="TCR (-10%)"
        value={formatRatio(metrics.tcrMinus10)}
        icon={<Shield className="h-4 w-4" />}
        subtitle="10% BTC drop scenario"
        variant={getTcrVariant(metrics.tcrMinus10)}
      />

      <MetricCard
        title="TCR (-20%)"
        value={formatRatio(metrics.tcrMinus20)}
        icon={<AlertTriangle className="h-4 w-4" />}
        subtitle="20% BTC drop scenario"
        variant={getTcrVariant(metrics.tcrMinus20)}
      />
    </div>
  );
};
