import { useEffect } from "react";
import {
  AppContracts,
  MezoChain,
  MezoChainTestnet,
  PriceFeedFetcher,
  TroveFetcher,
  TroveFetcherWrapper,
} from "@mtools/shared";
import { createPublicClient, http, webSocket, type PublicClient } from "viem";
import { useDashboardStore, type NetworkType } from "@/stores/dashboardStore";

const ACTIVITY_BLOCK_LOOKBACK = 10_000;

const pickChain = (network: NetworkType) =>
  network === "mainnet" ? MezoChain : MezoChainTestnet;

const pickTroveManager = (network: NetworkType) =>
  network === "mainnet"
    ? AppContracts.MEZO_TROVE_MANAGER
    : AppContracts.MEZO_TESTNET_TROVE_MANAGER;

const formatTroves = (
  troves: Awaited<ReturnType<TroveFetcherWrapper["getTrovesWithData"]>>
) =>
  troves.map((trove) => ({
    owner: trove.owner,
    collateralBtc: trove.collateral,
    principalDebt: trove.principal_debt,
    interest: trove.interest,
    icr: trove.collaterizationRatio,
  }));

export const useCommunicator = () => {
  const {
    updateConnection,
    updateBlock,
    updateTroves,
    removeTroves,
    setLiquidations,
    setRedemptions,
    rpcUrl,
    network,
  } = useDashboardStore();

  useEffect(() => {
    if (!rpcUrl) {
      updateConnection({ connected: false });
      return;
    }

    let isActive = true;
    let client: PublicClient | null = null;
    let fetcher: TroveFetcherWrapper | null = null;
    let reconnectAttempts = 0;
    let reconnectHandle: ReturnType<typeof setTimeout> | null = null;
    let blockUnwatch: (() => void) | null = null;
    let isFetchingEvents = false;
    let lastFetchedBlock: number | null = null;

    const cleanupClient = () => {
      if (blockUnwatch) {
        blockUnwatch();
        blockUnwatch = null;
      }
      fetcher = null;
      client = null;
    };

    const scheduleReconnect = () => {
      if (!isActive) return;
      cleanupClient();
      if (reconnectHandle) {
        clearTimeout(reconnectHandle);
      }

      reconnectAttempts += 1;
      const delay = Math.min(1000 * 2 ** Math.min(reconnectAttempts, 4), 15000);

      updateConnection({
        connected: false,
        reconnectAttempts,
      });

      reconnectHandle = setTimeout(() => {
        if (!isActive) return;
        void connect();
      }, delay);
    };

    const syncEvents = async (currentBlock?: number) => {
      if (!isActive || isFetchingEvents || !fetcher) return;
      isFetchingEvents = true;

      const referenceBlock = currentBlock ?? lastFetchedBlock ?? 0;
      const fromBlock = Math.max(referenceBlock - ACTIVITY_BLOCK_LOOKBACK, 0);

      try {
        const [liquidations, redemptions] = await Promise.all([
          fetcher.getLiquidationsSinceBlock(fromBlock),
          fetcher.getRedemptionsSinceBlock(fromBlock),
        ]);

        if (!isActive) return;

        setLiquidations(liquidations.slice(-50));
        setRedemptions(redemptions.slice(-50));
      } catch (error) {
        console.error("Failed to fetch protocol activity", error);
      } finally {
        isFetchingEvents = false;
      }
    };

    const fetchBlockData = async (blockNumber: number) => {
      if (!fetcher || !client || !isActive) {
        return;
      }

      const [block, btcPrice] = await Promise.all([
        client.getBlock({ blockNumber: BigInt(blockNumber) }),
        fetcher.getBtcPrice(),
      ]);

      const [systemState, troves] = await Promise.all([
        fetcher.getSystemState(btcPrice),
        fetcher.getTrovesWithData(btcPrice),
      ]);

      if (!isActive) return;

      const timestamp =
        typeof block.timestamp === "number"
          ? block.timestamp
          : Number(block.timestamp ?? Math.floor(Date.now() / 1000));

      updateBlock({
        height: blockNumber,
        timestamp,
        btcPrice: systemState.btcPrice,
      });

      const formattedTroves = formatTroves(troves);

      const existingOwners = new Set(
        Array.from(useDashboardStore.getState().troves.keys()).map((owner) =>
          owner.toLowerCase()
        )
      );
      const incomingOwners = new Set(
        formattedTroves.map((trove) => trove.owner.toLowerCase())
      );

      const removed = Array.from(existingOwners).filter(
        (owner) => !incomingOwners.has(owner)
      );

      if (removed.length > 0) {
        removeTroves(removed);
      }

      updateTroves(formattedTroves);
      lastFetchedBlock = blockNumber;
      reconnectAttempts = 0;
    };

    const maybeFetchBlock = async (
      blockNumber: number,
      { force = false }: { force?: boolean } = {}
    ) => {
      if (!isActive) return;

      if (!force && lastFetchedBlock !== null) {
        const blocksElapsed = blockNumber - lastFetchedBlock;
        if (blocksElapsed >= 0 && blocksElapsed < 20) {
          return;
        }
      }

      try {
        await fetchBlockData(blockNumber);
        await syncEvents(blockNumber);

        if (reconnectHandle) {
          clearTimeout(reconnectHandle);
          reconnectHandle = null;
        }

        updateConnection({ reconnectAttempts: 0, connected: true });
      } catch (error) {
        console.error("Failed to handle block update", error);
        scheduleReconnect();
      }
    };

    const connect = async () => {
      const trimmedUrl = rpcUrl.trim();
      if (!trimmedUrl) {
        updateConnection({ connected: false });
        return;
      }

      cleanupClient();

      try {
        const chain = pickChain(network);
        const transport = trimmedUrl.startsWith("ws")
          ? webSocket(trimmedUrl)
          : http(trimmedUrl);

        const clientInstance = createPublicClient({
          chain,
          transport,
        });

        client = clientInstance;

        const troveFetcher = new TroveFetcher(
          clientInstance,
          pickTroveManager(network)
        );
        const priceFeedAddress = await troveFetcher.getPriceFeedAddress();
        const priceFeedFetcher = new PriceFeedFetcher(
          clientInstance,
          priceFeedAddress
        );
        fetcher = new TroveFetcherWrapper(troveFetcher, priceFeedFetcher);

        const start = performance.now();
        const currentBlock = await clientInstance.getBlockNumber();
        const latency = performance.now() - start;

        updateConnection({
          connected: true,
          latency,
          reconnectAttempts: 0,
          lastUpdate: Date.now(),
        });

        await maybeFetchBlock(Number(currentBlock), { force: true });

        blockUnwatch = clientInstance.watchBlocks({
          emitMissed: true,
          onBlock: (block) => {
            if (!block.number) return;
            void maybeFetchBlock(Number(block.number));
          },
          onError: (error) => {
            console.error("Block subscription error", error);
            scheduleReconnect();
          },
        });
      } catch (error) {
        console.error("Failed to initialize viem client", error);
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      isActive = false;
      if (reconnectHandle) {
        clearTimeout(reconnectHandle);
      }
      cleanupClient();
      updateConnection({ connected: false });
    };
  }, [
    rpcUrl,
    network,
    updateConnection,
    updateBlock,
    updateTroves,
    removeTroves,
    setLiquidations,
    setRedemptions,
  ]);
};
