import {
  AlertOctagon,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/formatNumber";
import { TableCard, TableShell } from "@/components/TableShell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RiskAnalysisSummary, RiskProfile } from "@/lib/riskAnalysis";

interface RiskAnalysisProps {
  analysis: RiskAnalysisSummary;
  isLoading: boolean;
}

const riskBadgeClass = "h-5 px-2 text-[10px] font-semibold uppercase";

const truncateAddress = (address: string) => {
  if (address.length <= 12) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
};

const getCrColor = (cr: number) => {
  if (cr < 1.2) return "text-critical";
  if (cr < 1.6) return "text-high";
  if (cr < 2.0) return "text-elevated";
  return "text-safe";
};

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
  <div className={`rounded-xl bg-card/40 p-4 border-l-4 ${color}`}>
    <div className="mb-2 flex items-start justify-between gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />
    </div>
    <div className="mb-1 text-2xl font-bold">{count}</div>
    <div className="mb-2 text-sm text-muted-foreground">
      {formatNumber(collateral, { maximumFractionDigits: 4 })} BTC
    </div>
    <div className="text-xs text-muted-foreground">{description}</div>
  </div>
);

const ExposureBadge = ({
  isNearRedemption,
  isNearLiquidation,
}: {
  isNearRedemption: boolean;
  isNearLiquidation: boolean;
}) => {
  if (isNearRedemption && isNearLiquidation) {
    return (
      <Badge variant="destructive" className={riskBadgeClass}>
        Double risk
      </Badge>
    );
  }
  if (isNearRedemption) {
    return (
      <Badge className={`${riskBadgeClass} bg-high text-white`}>
        Redemption
      </Badge>
    );
  }
  return <Badge className={`${riskBadgeClass} bg-safe text-white`}>Safe</Badge>;
};

const RiskAddress = ({ profile }: { profile: RiskProfile }) => (
  <div className="flex items-center gap-2">
    <a
      href={`https://explorer.mezo.org/address/${profile.trove.owner}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-sm text-primary hover:underline break-all"
    >
      {truncateAddress(profile.trove.owner)}
    </a>
    <ExposureBadge
      isNearRedemption={profile.isNearRedemption}
      isNearLiquidation={profile.isNearLiquidation}
    />
  </div>
);

const CorrelationTable = ({ analysis }: { analysis: RiskAnalysisSummary }) => {
  if (analysis.topExposures.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-card-border/50 bg-muted/20 p-4 text-sm text-muted-foreground">
        No troves available yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <RotateCcw className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-muted-foreground">
          Redemption and liquidation correlation
        </h3>
      </div>

      <TableShell className="hidden md:block">
        <Table>
          <TableHeader className="bg-muted/20">
            <TableRow>
              <TableHead>Address</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Redemption rank</TableHead>
              <TableHead className="text-right">BTC ahead</TableHead>
              <TableHead className="text-right">CR</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analysis.topExposures.map((profile) => (
              <TableRow key={profile.trove.id || profile.trove.owner}>
                <TableCell>
                  <RiskAddress profile={profile} />
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {profile.score}/100
                </TableCell>
                <TableCell className="text-right font-medium">
                  #{profile.redemptionRank}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatNumber(profile.collateralAhead, {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4,
                  })}{" "}
                  BTC
                </TableCell>
                <TableCell
                  className={`text-right font-semibold ${getCrColor(
                    profile.trove.collaterization_ratio
                  )}`}
                >
                  {formatNumber(profile.trove.collaterization_ratio * 100, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                  %
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableShell>

      <div className="space-y-3 md:hidden">
        {analysis.topExposures.map((profile) => (
          <TableCard key={profile.trove.id || profile.trove.owner}>
            <div className="flex items-center justify-between gap-2">
              <RiskAddress profile={profile} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Score:</span>{" "}
                <span className="font-semibold">{profile.score}/100</span>
              </div>
              <div>
                <span className="text-muted-foreground">Redemption rank:</span>{" "}
                <span className="font-medium">#{profile.redemptionRank}</span>
              </div>
              <div>
                <span className="text-muted-foreground">BTC ahead:</span>{" "}
                <span className="font-medium">
                  {formatNumber(profile.collateralAhead, {
                    minimumFractionDigits: 4,
                    maximumFractionDigits: 4,
                  })}{" "}
                  BTC
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">CR:</span>{" "}
                <span
                  className={`font-semibold ${getCrColor(
                    profile.trove.collaterization_ratio
                  )}`}
                >
                  {formatNumber(profile.trove.collaterization_ratio * 100, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                  %
                </span>
              </div>
            </div>
          </TableCard>
        ))}
      </div>
    </div>
  );
};

export const RiskAnalysis = ({ analysis, isLoading }: RiskAnalysisProps) => {
  if (isLoading) {
    return (
      <Card className="glass-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Risk Analysis</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-xl bg-muted/20"
            />
          ))}
        </div>
      </Card>
    );
  }

  const doubleRisk = analysis.doubleRisk;
  const redemptionRisk = analysis.redemptionRisk;
  const safeZone = analysis.safeZone;

  return (
    <Card className="glass-card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-primary">
        <ShieldAlert className="h-5 w-5 text-high" />
        Risk Analysis
      </h2>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <RiskTile
          title="Double risk"
          count={doubleRisk.count}
          collateral={doubleRisk.collateral}
          description="Near redemption order and liquidation threshold"
          icon={AlertOctagon}
          color="border-critical"
          iconColor="text-critical"
        />
        <RiskTile
          title="Redemption risk"
          count={redemptionRisk.count}
          collateral={redemptionRisk.collateral}
          description="Close to the front of redemption order"
          icon={RotateCcw}
          color="border-high"
          iconColor="text-high"
        />
        <RiskTile
          title="Safe zone"
          count={safeZone.count}
          collateral={safeZone.collateral}
          description="Away from the redemption-front risk zone"
          icon={ShieldCheck}
          color="border-safe"
          iconColor="text-safe"
        />
      </div>

      <CorrelationTable analysis={analysis} />
    </Card>
  );
};
