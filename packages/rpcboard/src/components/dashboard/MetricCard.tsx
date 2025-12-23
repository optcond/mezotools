import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  variant?: "default" | "critical" | "warning" | "success";
}

export const MetricCard = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  className = "",
  variant = "default",
}: MetricCardProps) => {
  const getVariantStyles = () => {
    switch (variant) {
      case "critical":
        return "border-risk-critical bg-gradient-to-br from-risk-critical/10 to-card";
      case "warning":
        return "border-risk-high bg-gradient-to-br from-risk-high/10 to-card";
      case "success":
        return "border-risk-safe bg-gradient-to-br from-risk-safe/10 to-card";
      default:
        return "border-border bg-gradient-to-br from-card to-muted";
    }
  };

  const getValueColor = () => {
    switch (variant) {
      case "critical":
        return "text-risk-critical";
      case "warning":
        return "text-risk-high";
      case "success":
        return "text-risk-safe";
      default:
        return "text-foreground";
    }
  };

  return (
    <Card
      className={`${getVariantStyles()} shadow-card hover:shadow-lg transition-all duration-300 ${className}`}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${getValueColor()}`}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
        {trend && (
          <div
            className={`text-xs mt-2 flex items-center ${
              trend.isPositive ? "text-risk-safe" : "text-risk-critical"
            }`}
          >
            <span>{trend.isPositive ? "↗" : "↘"}</span>
            <span className="ml-1">{Math.abs(trend.value)}%</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
