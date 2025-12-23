import { useDashboardStore, type NetworkType } from "@/stores/dashboardStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, Wifi, WifiOff, Activity } from "lucide-react";
import { useEffect, useState } from "react";

export const Header = () => {
  const {
    connection,
    currentBlock,
    btcPrice,
    manualBtcPrice,
    setManualBtcPrice,
    rpcUrl,
    setRpcUrl,
    rpcUrls,
    network,
    setNetwork,
  } = useDashboardStore();

  const [showSettings, setShowSettings] = useState(false);
  const [tempRpcUrl, setTempRpcUrl] = useState(rpcUrl);
  const [tempBtcPrice, setTempBtcPrice] = useState(
    manualBtcPrice?.toString() || ""
  );
  const [tempNetwork, setTempNetwork] = useState<NetworkType>(network);

  useEffect(() => {
    setTempNetwork(network);
  }, [network]);

  useEffect(() => {
    setTempRpcUrl(rpcUrls[tempNetwork] ?? "");
  }, [rpcUrls, tempNetwork]);

  const handleSaveSettings = () => {
    const normalizedRpc = tempRpcUrl.trim();
    setNetwork(tempNetwork);
    setRpcUrl(normalizedRpc);
    if (tempBtcPrice) {
      setManualBtcPrice(parseFloat(tempBtcPrice));
    } else {
      setManualBtcPrice(null);
    }
    setShowSettings(false);
  };

  const handleNetworkSelect = (value: NetworkType) => {
    setTempNetwork(value);
    setTempRpcUrl(rpcUrls[value] ?? "");
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString();
  };

  const getLatencyColor = (latency: number) => {
    if (latency < 100) return "status-online";
    if (latency < 500) return "status-warning";
    return "status-offline";
  };

  const networkLabel = network === "mainnet" ? "Mainnet" : "Testnet";
  const tempNetworkLabel = tempNetwork === "mainnet" ? "Mainnet" : "Testnet";

  return (
    <header className="bg-gradient-to-r from-card via-card to-muted border-b border-border px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              MUSD Monitor
            </h1>
            <Badge variant="secondary" className="uppercase tracking-wide">
              {networkLabel}
            </Badge>
          </div>

          {/* Connection Status */}
          <div className="flex items-center space-x-2">
            {connection.connected ? (
              <Wifi className="h-4 w-4 status-online" />
            ) : (
              <WifiOff className="h-4 w-4 status-offline" />
            )}
            <Badge variant={connection.connected ? "default" : "destructive"}>
              {connection.connected ? "Online" : "Offline"}
            </Badge>
            {connection.connected && (
              <span
                className={`text-sm ${getLatencyColor(connection.latency)}`}
              >
                {connection.latency}ms
              </span>
            )}
          </div>

          {/* Block Info */}
          {currentBlock && (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Block #{currentBlock.height.toLocaleString()}
                </span>
              </div>
              <span className="text-sm text-muted-foreground">
                {formatTime(currentBlock.timestamp)}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-4">
          {/* BTC Price */}
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">
              $
              {(manualBtcPrice || btcPrice).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="text-sm text-muted-foreground">
              BTC{manualBtcPrice && " (Manual)"}
            </div>
          </div>

          {/* Settings */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mt-4 p-4 bg-muted rounded-lg border border-border animate-slide-up">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Network</label>
              <Select
                value={tempNetwork}
                onValueChange={(value) =>
                  handleNetworkSelect(value as NetworkType)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select network" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mainnet">Mainnet</SelectItem>
                  <SelectItem value="testnet">Testnet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">
                RPC URL ({tempNetworkLabel})
              </label>
              <Input
                value={tempRpcUrl}
                onChange={(e) => setTempRpcUrl(e.target.value)}
                placeholder="wss://rpc-ws.test.mezo.org"
                className="mt-1"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">
                Manual BTC Price (USD)
              </label>
              <Input
                value={tempBtcPrice}
                onChange={(e) => setTempBtcPrice(e.target.value)}
                placeholder="Auto from network"
                type="number"
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2 mt-4">
            <Button variant="ghost" onClick={() => setShowSettings(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings}>Save</Button>
          </div>
        </div>
      )}
    </header>
  );
};
