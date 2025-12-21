import {
  AlertTriangle,
  AlertOctagon,
  ShieldAlert,
  ShieldQuestion,
  ShieldCheck,
  PieChart as PieChartIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PieChart, Pie, Cell, Legend, ResponsiveContainer, Tooltip } from "recharts";

interface RiskBucket {
  count: number;
  collateral: number;
}

interface RiskAnalysisProps {
  critical: RiskBucket;
  high: RiskBucket;
  elevated: RiskBucket;
  safe: RiskBucket;
  isLoading: boolean;
}

const RiskTile = ({
  title,
  count,
  collateral,
  description,
  icon: Icon,
  color,
  iconColor,
}: {
  title: string;
  count: number;
  collateral: number;
  description: string;
  icon: React.ElementType;
  color: string;
  iconColor: string;
}) => (
  <div className={`p-4 rounded-xl bg-card/40 border-l-4 ${color}`}>
    <div className="flex items-start justify-between mb-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <Icon className={`h-5 w-5 ${iconColor}`} />
    </div>
    <div className="text-2xl font-bold mb-1">{count}</div>
    <div className="text-sm text-muted-foreground mb-2">{collateral.toFixed(4)} BTC</div>
    <div className="text-xs text-muted-foreground">{description}</div>
  </div>
);

export const RiskAnalysis = ({ critical, high, elevated, safe, isLoading }: RiskAnalysisProps) => {
  const pieData = [
    { name: "Critical <1.2", value: critical.count, color: "hsl(var(--critical))" },
    { name: "High 1.2-1.6", value: high.count, color: "hsl(var(--high))" },
    { name: "Elevated 1.6-2.0", value: elevated.count, color: "hsl(var(--elevated))" },
    { name: "Safe ≥2.0", value: safe.count, color: "hsl(var(--safe))" },
  ];

  if (isLoading) {
    return (
      <Card className="glass-card p-6">
        <h2 className="text-lg font-semibold mb-4">Risk Analysis</h2>
        <div className="h-64 bg-muted/20 animate-pulse rounded-xl" />
      </Card>
    );
  }

  return (
    <Card className="glass-card p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-primary">
        <ShieldAlert className="h-5 w-5 text-high" />
        Risk Analysis
      </h2>

      {/* Risk Summary Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <RiskTile
          title="Critical <1.2"
          count={critical.count}
          collateral={critical.collateral}
          description="Immediate liquidation risk"
          icon={AlertOctagon}
          color="border-critical"
          iconColor="text-critical"
        />
        <RiskTile
          title="High 1.2–1.6"
          count={high.count}
          collateral={high.collateral}
          description="High risk threshold"
          icon={AlertTriangle}
          color="border-high"
          iconColor="text-high"
        />
        <RiskTile
          title="Elevated 1.6–2.0"
          count={elevated.count}
          collateral={elevated.collateral}
          description="Moderate risk level"
          icon={ShieldQuestion}
          color="border-elevated"
          iconColor="text-elevated"
        />
        <RiskTile
          title="Safe ≥2.0"
          count={safe.count}
          collateral={safe.collateral}
          description="Low risk level"
          icon={ShieldCheck}
          color="border-safe"
          iconColor="text-safe"
        />
      </div>

      {/* Pie Chart */}
      <div className="bg-card/40 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-4 text-muted-foreground flex items-center gap-2">
          <PieChartIcon className="h-4 w-4" />
          Risk Distribution
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Legend 
              verticalAlign="bottom" 
              height={36}
              formatter={(value, entry: any) => {
                const total = pieData.reduce((sum, item) => sum + item.value, 0);
                const percentage = ((entry.payload.value / total) * 100).toFixed(1);
                return `${value}: ${entry.payload.value} (${percentage}%)`;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Alert Banner */}
      {critical.count > 0 && (
        <Alert variant="destructive" className="mt-6">
          <AlertOctagon className="h-4 w-4 text-critical" />
          <AlertDescription>
            {critical.count} trove{critical.count > 1 ? 's' : ''} below 1.2 CR with {critical.collateral.toFixed(4)} BTC at risk of liquidation
          </AlertDescription>
        </Alert>
      )}
    </Card>
  );
};
