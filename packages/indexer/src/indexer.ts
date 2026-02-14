import { env } from "process";
import { IndexerConfig, loadConfig } from "./config";
import {
  Chain,
  createPublicClient,
  webSocket,
  http,
  WebSocketTransport,
  HttpTransport,
  PublicClient,
} from "viem";
import {
  BridgeAssetFetcher,
  BridgeChecker,
  ContractChecker,
  GaugesFetcher,
  KyberSwapFetcher,
  MezoChain,
  ProviderType,
  TroveFetcher,
  TroveFetcherWrapper,
  createSupabase,
  SupabaseRepository,
  SystemSnapshot,
  PriceFeedFetcher,
} from "@mtools/shared";
import { mainnet } from "viem/chains";
import { BlockFetcher } from "@mtools/shared/src/lib/blockFetcher";

interface IndexerDependencies {
  repository: SupabaseRepository;
  bridgeAssetFetcher: BridgeAssetFetcher;
  dataManager: TroveFetcherWrapper;
  kyberSwap: KyberSwapFetcher;
  mezoClient: PublicClient;
  ethClient: PublicClient;
  gaugesFetcher: GaugesFetcher;
  bridgeChecker: BridgeChecker;
  contractChecker: ContractChecker;
}

export class Indexer {
  constructor(
    private config: IndexerConfig,
    private readonly deps: IndexerDependencies,
  ) {}

  static async createFromEnv(): Promise<Indexer> {
    const createClient = (
      _type: ProviderType,
      url: string,
      chain: Chain,
    ): PublicClient => {
      let transport: WebSocketTransport | HttpTransport;
      if (_type === ProviderType.WEBSOCKET) {
        transport = webSocket(url);
      } else {
        transport = http(url);
      }
      return createPublicClient({
        chain: chain,
        transport: transport,
      });
    };

    const config = loadConfig(env);

    const mezoClient = createClient(
      config.mezoRpcType,
      config.mezoRpcUrl,
      MezoChain as Chain,
    );

    const ethClient = createClient(
      config.ethereumRpcType,
      config.ethereumRpcUrl,
      mainnet,
    );

    // troveManager
    const troveFetcher = new TroveFetcher(mezoClient);
    const feedAddress = await troveFetcher.getPriceFeedAddress();
    const priceFeedFetcher = new PriceFeedFetcher(mezoClient, feedAddress);

    const dataManager = new TroveFetcherWrapper(troveFetcher, priceFeedFetcher);

    const kyberSwap = new KyberSwapFetcher();

    // bridgeAssetFetcher
    const bridgeAssetFetcher = new BridgeAssetFetcher(ethClient);

    const blockFetcher = new BlockFetcher(mezoClient);
    const gaugesFetcher = new GaugesFetcher(mezoClient);
    const bridgeChecker = new BridgeChecker(mezoClient, blockFetcher);
    const contractChecker = new ContractChecker(mezoClient, blockFetcher);

    // repository
    const supabaseClient = createSupabase({
      url: config.supabaseUrl,
      serviceKey: config.supabaseServiceKey,
    });
    const repository = new SupabaseRepository(supabaseClient);

    return new Indexer(config, {
      repository,
      bridgeAssetFetcher,
      dataManager,
      kyberSwap,
      mezoClient,
      ethClient,
      gaugesFetcher,
      bridgeChecker,
      contractChecker,
    });
  }

  async close(): Promise<void> {
    if ("getRpcClient" in this.deps.mezoClient.transport) {
      const mRpcClient = await this.deps.mezoClient.transport.getRpcClient();
      if (mRpcClient.socket) {
        mRpcClient.socket.close();
      }
    }

    if ("getRpcClient" in this.deps.ethClient.transport) {
      const eRpcClient = await this.deps.ethClient.transport.getRpcClient();
      if (eRpcClient.socket) {
        eRpcClient.socket.close();
      }
    }
  }

  async run(): Promise<void> {
    const btcPrice = await this.deps.dataManager.getBtcPrice();

    const [
      lastKnownBlock,
      currentBlock,
      bridgeAssets,
      systemState,
      troves,
      gaugeIncentives,
      epochTiming,
      totalVeSupply,
      totalVotingPower,
    ] = await Promise.all([
      /* blocks information */
      this.deps.repository.getLastProcessedBlock(),
      this.deps.mezoClient.getBlockNumber(),

      /* eth bridge assets */
      this.deps.bridgeAssetFetcher.fetchAssets(),

      /* troves state */
      this.deps.dataManager.getSystemState(btcPrice),
      this.deps.dataManager.getTrovesWithData(btcPrice),

      /* gauge incentives */
      this.deps.gaugesFetcher.fetchGaugeIncentives({
        probeAdjacentEpochs: true,
      }),
      this.deps.gaugesFetcher.getEpochTiming(),
      this.deps.gaugesFetcher.getTotalVeSupply(),
      this.deps.gaugesFetcher.getTotalVotingPower(),
    ]);
    const currentBlockNumber = Number(currentBlock);

    console.log(`Last known processed block: ${lastKnownBlock}`);
    console.log(`Current block number: ${currentBlockNumber}`);
    console.log(
      `Fetched ${troves.length} troves, TCR: ${systemState.ratio}, BTC Price: ${systemState.btcPrice}`,
    );

    let musdToUsdcPrice: number | null = null;
    try {
      const swapData = await this.deps.kyberSwap.getMUSDSellQuote();
      musdToUsdcPrice = swapData.buyAmount;
      console.log(`Fetched mUSD to USDC price: ${musdToUsdcPrice}`);
    } catch (error) {
      console.warn(
        `Failed to fetch mUSD/USDC quote from KyberSwap, using last known price: ${error instanceof Error ? error.message : String(error)}`,
      );
      try {
        musdToUsdcPrice = await this.deps.repository.getLatestMusdToUsdcPrice();
      } catch (fallbackError) {
        console.warn(
          `Failed to load last known mUSD/USDC price: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
        );
      }

      if (musdToUsdcPrice !== null) {
        console.log(`Loaded last known mUSD to USDC price: ${musdToUsdcPrice}`);
      } else {
        console.warn(
          "mUSD to USDC price unavailable: no previous snapshot found",
        );
      }
    }

    const systemSnapshot: SystemSnapshot = {
      ...systemState,
      btcPrice: systemState.btcPrice,
      musdToUsdcPrice,
    };

    const veSupplyEpochStart =
      (await this.deps.gaugesFetcher.getTotalVeSupplyAt(
        epochTiming.epochStart,
      )) ?? 0n;
    const totalVotesTracked = gaugeIncentives.reduce(
      (acc, gauge) => acc + gauge.votes,
      0n,
    );

    await Promise.all([
      this.deps.repository.upsertTroves(troves),
      this.deps.repository.storeSystemSnapshot(systemSnapshot),
      this.deps.repository.storeDailyMetrics(systemSnapshot, troves.length),
      this.deps.repository.upsertGaugeState({
        epochEnd: epochTiming.epochEnd,
        voteEnd: epochTiming.voteEnd,
        veSupplyLive: totalVeSupply,
        totalVotesSnapshot: totalVotingPower,
        totalVotesTracked,
        veSupplyEpochStart,
      }),
      this.deps.repository.upsertGauges(gaugeIncentives),
    ]);
    console.log("Upserted troves, gauges, and stored system snapshot");

    if (bridgeAssets.length === 0) {
      console.warn("No bridge assets fetched during sync");
    } else {
      (await this.deps.repository.upsertBridgeAssets(bridgeAssets),
        console.log(`Upserted ${bridgeAssets.length} bridge assets`));
    }

    /* Liquidations and redemptions */
    await this._processLiqsAndRedemps(lastKnownBlock, currentBlockNumber);

    /* 4H average charts data */
    await this._process4hHistory(
      currentBlockNumber,
      systemSnapshot.btcPrice,
      musdToUsdcPrice,
    );

    await this._processBridgeTransfers(lastKnownBlock, currentBlockNumber);
    await this._processContractCreations(lastKnownBlock, currentBlockNumber);

    await this.deps.repository.updateIndexerState(currentBlockNumber);
    console.log(`Recorded indexer state to block ${currentBlockNumber}`);
  }

  private async _processBridgeTransfers(
    lastKnownBlock: number,
    currentBlock: number,
  ): Promise<void> {
    const startBlock = Math.max(lastKnownBlock + 1, 0);

    if (startBlock > currentBlock) {
      console.log("No new bridge transfers to index");
      return;
    }

    console.log(
      `Indexing bridge transfers from block ${startBlock} to ${currentBlock}`,
    );

    const transfers = await this.deps.bridgeChecker.getBridgeTransfersInRange({
      fromBlock: BigInt(startBlock),
      toBlock: BigInt(currentBlock),
    });

    if (transfers.length === 0) {
      console.log("No bridge transfers found in range");
      return;
    }

    await this.deps.repository.upsertBridgeTransfers(transfers);
    console.log(`Upserted ${transfers.length} bridge transfers`);
  }

  private async _processContractCreations(
    lastKnownBlock: number,
    currentBlock: number,
  ): Promise<void> {
    const startBlock = Math.max(lastKnownBlock + 1, 0);

    if (startBlock > currentBlock) {
      console.log("No new contract creations to index");
      return;
    }

    console.log(
      `Indexing contract creations from block ${startBlock} to ${currentBlock}`,
    );

    const creations =
      await this.deps.contractChecker.getContractCreationsInRange({
        fromBlock: BigInt(startBlock),
        toBlock: BigInt(currentBlock),
      });

    if (creations.length === 0) {
      console.log("No contract creations found in range");
      return;
    }

    await this.deps.repository.upsertContractCreations(creations);
    console.log(`Upserted ${creations.length} contract creations`);
  }

  private async _processLiqsAndRedemps(
    lastKnownBlock: number,
    currentBlock: number,
  ): Promise<void> {
    let latestLiquidationBlock: number;
    let latestRedemptionBlock: number;
    if (process.env.ENVIRONMENT === "dev") {
      latestLiquidationBlock =
        lastKnownBlock > 0 ? lastKnownBlock : currentBlock - 1;
      latestRedemptionBlock =
        lastKnownBlock > 0 ? lastKnownBlock : currentBlock - 1;
    } else {
      latestLiquidationBlock =
        lastKnownBlock > 0 ? lastKnownBlock : currentBlock - 500000;
      latestRedemptionBlock =
        lastKnownBlock > 0 ? lastKnownBlock : currentBlock - 500000;
    }
    console.log(
      `Latest liquidation block: ${latestLiquidationBlock}, Latest redemption block: ${latestRedemptionBlock}`,
    );

    const [liquidations, redemptions] = await Promise.all([
      this.deps.dataManager.getLiquidationsSinceBlock(
        Math.max(latestLiquidationBlock + 1, 0),
        this.config.liquidationChunkSize,
      ),
      this.deps.dataManager.getRedemptionsSinceBlock(
        Math.max(latestRedemptionBlock + 1, 0),
        this.config.redemptionChunkSize,
      ),
    ]);
    console.log(
      `Fetched ${liquidations.length} liquidations and ${redemptions.length} redemptions`,
    );

    if (liquidations.length > 0) {
      await this.deps.repository.upsertLiquidations(liquidations);
      console.log("Upserted liquidation events");
    }
    if (redemptions.length > 0) {
      await this.deps.repository.upsertRedemptions(redemptions);
      console.log("Upserted redemption events");
    }
  }

  private async _process4hHistory(
    currentBlock: number,
    btcPrice: number,
    musdToUsdcPrice: number | null,
  ) {
    const [lastBtcOracleBlockValue, lastMusd4hBlockValue] = await Promise.all([
      this.deps.repository.getLastPriceFeedBlock("btc_oracle"),
      this.deps.repository.getLastPriceFeedBlock("musd_usdc_4h"),
    ]);

    const shouldRecordInstantPrice =
      lastBtcOracleBlockValue === null ||
      currentBlock - lastBtcOracleBlockValue >= 120;

    if (shouldRecordInstantPrice) {
      await this.deps.repository.recordPrice(
        btcPrice,
        "btc_oracle",
        currentBlock,
      );
      console.log(`Recorded BTC price ${btcPrice} ${currentBlock}`);
      if (musdToUsdcPrice !== null) {
        await this.deps.repository.recordPrice(
          Math.round(musdToUsdcPrice),
          "musd_usdc",
          currentBlock,
        );
        console.log(
          `Recorded MUSD price ${Math.round(musdToUsdcPrice)} ${currentBlock}`,
        );
      } else {
        console.log("Skipped recording MUSD price: value unavailable");
      }
    }

    const shouldRecordFourHourPrice =
      lastMusd4hBlockValue === null ||
      currentBlock - lastMusd4hBlockValue >= 2880;

    if (shouldRecordFourHourPrice) {
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const averageMusdToUsdcPrice =
        await this.deps.repository.getAverageMusdToUsdcPriceSince(fourHoursAgo);

      if (averageMusdToUsdcPrice !== null) {
        await this.deps.repository.recordPrice(
          averageMusdToUsdcPrice,
          "musd_usdc_4h",
          currentBlock,
        );
        console.log(
          `Recorded 4h MUSD average price ${averageMusdToUsdcPrice} ${currentBlock}`,
        );
      } else {
        console.log(
          "Skipped recording 4h MUSD average price: no snapshots available",
        );
      }
    }
  }
}
