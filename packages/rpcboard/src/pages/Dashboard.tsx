import { useDashboardStore } from "@/stores/dashboardStore";
import { Header } from "@/components/dashboard/Header";
import { MetricsGrid } from "@/components/dashboard/MetricsGrid";
import { RiskPanel } from "@/components/dashboard/RiskPanel";
import { ChartsSection } from "@/components/dashboard/ChartsSection";
import { TrovesTable } from "@/components/dashboard/TrovesTable";
import { ActivityPanel } from "@/components/dashboard/ActivityPanel";
import { useCommunicator } from "@/hooks/useCommunicator";

const Dashboard = () => {
  useCommunicator();
  const { troves, currentBlock } = useDashboardStore();

  const isEmpty = troves.size === 0 || !currentBlock;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="space-y-0">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <p className="text-lg font-medium">
              Waiting for blockchain data...
            </p>
            <p className="text-sm">
              Ensure the communicator WebSocket endpoint is reachable.
            </p>
          </div>
        ) : (
          <>
            <MetricsGrid />
            <RiskPanel />
            {/* <ChartsSection /> */}
            <ActivityPanel />
            <TrovesTable />
          </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
