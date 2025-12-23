import { create } from "zustand";
import {
  MezoChain,
  MezoChainTestnet,
  TroveLiquidationEvent,
  TroveRedemptionEvent,
} from "@mtools/shared";
import {
  Trove,
  BlockData,
  DashboardMetrics,
  ConnectionStatus,
} from "@/types/trove";

export type NetworkType = "mainnet" | "testnet";

const NETWORK_STORAGE_KEY = "network";
const RPC_STORAGE_PREFIX = "rpcUrl:";

const isBrowser = typeof window !== "undefined";

const getStoredValue = (key: string) => {
  if (!isBrowser) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const setStoredValue = (key: string, value: string) => {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
};

const getDefaultRpcUrl = (network: NetworkType) => {
  const chain = network === "mainnet" ? MezoChain : MezoChainTestnet;
  return (
    chain.rpcUrls?.default?.webSocket?.[0] ??
    chain.rpcUrls?.default?.http?.[0] ??
    ""
  );
};

const loadInitialNetwork = () => {
  const stored = getStoredValue(NETWORK_STORAGE_KEY);
  return stored === "mainnet" || stored === "testnet" ? stored : "testnet";
};

const loadInitialRpcUrls = (): Record<NetworkType, string> => ({
  mainnet:
    getStoredValue(`${RPC_STORAGE_PREFIX}mainnet`) ??
    getDefaultRpcUrl("mainnet"),
  testnet:
    getStoredValue(`${RPC_STORAGE_PREFIX}testnet`) ??
    getDefaultRpcUrl("testnet"),
});

const initialNetwork = loadInitialNetwork();
const initialRpcUrls = loadInitialRpcUrls();
const initialRpcUrl =
  initialRpcUrls[initialNetwork] ?? getDefaultRpcUrl(initialNetwork);

const createDefaultMetrics = (): DashboardMetrics => ({
  totalTroves: 0,
  totalCollateral: 0,
  totalDebt: 0,
  tcr: 0,
  tcrMinus10: 0,
  tcrMinus20: 0,
  trovesUnder120: 0,
  trovesUnder150: 0,
  trovesUnder200: 0,
  collateralUnder120: 0,
  collateralUnder150: 0,
  collateralUnder200: 0,
});

interface DashboardState {
  // Connection
  connection: ConnectionStatus;
  rpcUrl: string;
  rpcUrls: Record<NetworkType, string>;
  network: NetworkType;

  // Data
  troves: Map<string, Trove>;
  currentBlock: BlockData | null;
  btcPrice: number;
  manualBtcPrice: number | null;
  liquidations: TroveLiquidationEvent[];
  redemptions: TroveRedemptionEvent[];

  // Metrics
  metrics: DashboardMetrics;

  // Settings
  watchlist: Set<string>;
  riskThresholds: {
    critical: number;
    high: number;
    medium: number;
  };

  // Actions
  updateConnection: (status: Partial<ConnectionStatus>) => void;
  updateBlock: (block: BlockData) => void;
  updateTroves: (troves: Trove[]) => void;
  removeTroves: (owners: string[]) => void;
  setManualBtcPrice: (price: number | null) => void;
  setLiquidations: (events: TroveLiquidationEvent[]) => void;
  setRedemptions: (events: TroveRedemptionEvent[]) => void;
  addToWatchlist: (owner: string) => void;
  removeFromWatchlist: (owner: string) => void;
  updateRiskThresholds: (
    thresholds: Partial<DashboardState["riskThresholds"]>
  ) => void;
  calculateMetrics: () => void;
  setRpcUrl: (url: string) => void;
  setNetwork: (network: NetworkType) => void;
}

const calculateTroveData = (trove: Trove, btcPrice: number) => {
  const debt = trove.principalDebt + trove.interest;
  const cr = (trove.collateralBtc * btcPrice) / debt;
  return { ...trove, debt, cr };
};

const calculateDashboardMetrics = (
  troves: Map<string, Trove>,
  btcPrice: number
): DashboardMetrics => {
  const troveArray = Array.from(troves.values()).map((t) =>
    calculateTroveData(t, btcPrice)
  );

  const totalCollateral = troveArray.reduce(
    (sum, t) => sum + t.collateralBtc,
    0
  );
  const totalDebt = troveArray.reduce((sum, t) => sum + t.debt!, 0);
  const tcr = (totalCollateral * btcPrice) / totalDebt;

  const trovesUnder120 = troveArray.filter((t) => t.cr! < 1.2).length;
  const trovesUnder150 = troveArray.filter((t) => t.cr! < 1.5).length;
  const trovesUnder200 = troveArray.filter((t) => t.cr! < 2.0).length;

  const collateralUnder120 = troveArray
    .filter((t) => t.cr! < 1.2)
    .reduce((sum, t) => sum + t.collateralBtc, 0);
  const collateralUnder150 = troveArray
    .filter((t) => t.cr! < 1.5)
    .reduce((sum, t) => sum + t.collateralBtc, 0);
  const collateralUnder200 = troveArray
    .filter((t) => t.cr! < 2.0)
    .reduce((sum, t) => sum + t.collateralBtc, 0);

  return {
    totalTroves: troveArray.length,
    totalCollateral,
    totalDebt,
    tcr,
    tcrMinus10: tcr * 0.9,
    tcrMinus20: tcr * 0.8,
    trovesUnder120,
    trovesUnder150,
    trovesUnder200,
    collateralUnder120,
    collateralUnder150,
    collateralUnder200,
  };
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  // Initial state
  connection: {
    connected: false,
    latency: 0,
    lastUpdate: 0,
    reconnectAttempts: 0,
  },
  rpcUrl: initialRpcUrl,
  rpcUrls: initialRpcUrls,
  network: initialNetwork,
  troves: new Map(),
  currentBlock: null,
  btcPrice: 100000,
  manualBtcPrice: null,
  liquidations: [],
  redemptions: [],
  metrics: createDefaultMetrics(),
  watchlist: new Set(JSON.parse(localStorage.getItem("watchlist") || "[]")),
  riskThresholds: {
    critical: 1.2,
    high: 1.5,
    medium: 2.0,
  },

  // Actions
  updateConnection: (status) =>
    set((state) => ({
      connection: { ...state.connection, ...status },
    })),

  updateBlock: (block) =>
    set((state) => {
      const btcPrice = state.manualBtcPrice || block.btcPrice;
      const newState = {
        currentBlock: block,
        btcPrice,
        connection: { ...state.connection, lastUpdate: Date.now() },
      };
      // Recalculate metrics with new BTC price
      setTimeout(() => get().calculateMetrics(), 0);
      return newState;
    }),

  updateTroves: (troves) =>
    set((state) => {
      const newTroveMap = new Map(state.troves);
      troves.forEach((trove) => {
        newTroveMap.set(trove.owner, trove);
      });
      setTimeout(() => get().calculateMetrics(), 0);
      return { troves: newTroveMap };
    }),

  removeTroves: (owners) =>
    set((state) => {
      const newTroveMap = new Map(state.troves);
      owners.forEach((owner) => {
        newTroveMap.delete(owner);
      });
      setTimeout(() => get().calculateMetrics(), 0);
      return { troves: newTroveMap };
    }),

  setManualBtcPrice: (price) =>
    set((state) => {
      setTimeout(() => get().calculateMetrics(), 0);
      return { manualBtcPrice: price };
    }),

  setLiquidations: (events) =>
    set(() => ({
      liquidations: events,
    })),

  setRedemptions: (events) =>
    set(() => ({
      redemptions: events,
    })),

  addToWatchlist: (owner) =>
    set((state) => {
      const newWatchlist = new Set(state.watchlist);
      newWatchlist.add(owner);
      localStorage.setItem(
        "watchlist",
        JSON.stringify(Array.from(newWatchlist))
      );
      return { watchlist: newWatchlist };
    }),

  removeFromWatchlist: (owner) =>
    set((state) => {
      const newWatchlist = new Set(state.watchlist);
      newWatchlist.delete(owner);
      localStorage.setItem(
        "watchlist",
        JSON.stringify(Array.from(newWatchlist))
      );
      return { watchlist: newWatchlist };
    }),

  updateRiskThresholds: (thresholds) =>
    set((state) => ({
      riskThresholds: { ...state.riskThresholds, ...thresholds },
    })),

  calculateMetrics: () =>
    set((state) => {
      const btcPrice = state.manualBtcPrice || state.btcPrice;
      const metrics = calculateDashboardMetrics(state.troves, btcPrice);
      return { metrics };
    }),

  setRpcUrl: (url) => {
    const { network, rpcUrls } = get();
    setStoredValue(`${RPC_STORAGE_PREFIX}${network}`, url);
    set({
      rpcUrl: url,
      rpcUrls: { ...rpcUrls, [network]: url },
    });
  },
  setNetwork: (network) => {
    const state = get();
    if (state.network === network) {
      return;
    }
    const { rpcUrls } = state;
    const nextRpcUrl =
      rpcUrls[network] ?? getDefaultRpcUrl(network) ?? initialRpcUrl;
    setStoredValue(NETWORK_STORAGE_KEY, network);
    if (!rpcUrls[network]) {
      setStoredValue(`${RPC_STORAGE_PREFIX}${network}`, nextRpcUrl);
    }
    set({
      network,
      rpcUrl: nextRpcUrl,
      rpcUrls: { ...rpcUrls, [network]: nextRpcUrl },
      troves: new Map(),
      currentBlock: null,
      metrics: createDefaultMetrics(),
      liquidations: [],
      redemptions: [],
      btcPrice: 0,
      connection: {
        connected: false,
        latency: 0,
        lastUpdate: 0,
        reconnectAttempts: 0,
      },
    });
  },
}));
