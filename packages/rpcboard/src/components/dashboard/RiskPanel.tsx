import { useDashboardStore } from "@/stores/dashboardStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, TrendingDown } from "lucide-react";

export const RiskPanel = () => {
  const { metrics } = useDashboardStore();

  const formatBTC = (value: number) => {
    return value.toFixed(4) + " BTC";
  };

  const riskAlerts = [
    {
      level: "Critical Risk",
      threshold: "< 1.2",
      count: metrics.trovesUnder120,
      collateral: metrics.collateralUnder120,
      icon: <AlertTriangle className="h-4 w-4" />,
      variant: "critical" as const,
    },
    {
      level: "High Risk",
      threshold: "< 1.5",
      count: metrics.trovesUnder150,
      collateral: metrics.collateralUnder150,
      icon: <TrendingDown className="h-4 w-4" />,
      variant: "warning" as const,
    },
    {
      level: "Medium Risk",
      threshold: "< 2.0",
      count: metrics.trovesUnder200,
      collateral: metrics.collateralUnder200,
      icon: <Shield className="h-4 w-4" />,
      variant: "default" as const,
    },
  ];

  const getVariantClass = (variant: string) => {
    switch (variant) {
      case "critical":
        return "border-risk-critical text-risk-critical";
      case "warning":
        return "border-risk-high text-risk-high";
      default:
        return "border-risk-medium text-risk-medium";
    }
  };

  return (
    <div className="p-6">
      <Card className="border-border bg-gradient-to-br from-card to-muted shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-risk-high" />
            <span>Risk Analysis</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {riskAlerts.map((alert) => (
              <div
                key={alert.level}
                className={`p-4 rounded-lg border-2 ${getVariantClass(
                  alert.variant
                )} bg-opacity-5 transition-all duration-300 hover:bg-opacity-10`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {alert.icon}
                    <span className="font-medium">{alert.level}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    CR {alert.threshold}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <div className="text-2xl font-bold">{alert.count}</div>
                  <div className="text-sm text-muted-foreground">
                    Troves at risk
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Collateral: </span>
                    <span className="font-medium">
                      {formatBTC(alert.collateral)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Risk Summary Alert */}
          {metrics.trovesUnder120 > 0 && (
            <div className="mt-6 p-4 bg-risk-critical/10 border border-risk-critical rounded-lg">
              <div className="flex items-center space-x-2 text-risk-critical">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-bold">Critical Risk Alert</span>
              </div>
              <div className="mt-2 text-sm">
                <span className="font-medium">{metrics.trovesUnder120}</span>{" "}
                troves with CR below 1.2 containing{" "}
                <span className="font-medium">
                  {formatBTC(metrics.collateralUnder120)}
                </span>
                are at immediate liquidation risk.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
