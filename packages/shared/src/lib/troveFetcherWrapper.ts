import { formatUnits, GetContractEventsReturnType } from "viem";
import { PriceFeedFetcher } from "./priceFeedFetcher";
import { TroveFetcher } from "./troveFetcher";
import { TroveLiquidationEvent, TroveRedemptionEvent } from "../trove.types";
import { TroveManagerAbi } from "../abi/TroveManager";

export class TroveFetcherWrapper {
  constructor(
    private fetcher: TroveFetcher,
    private priceFeed: PriceFeedFetcher
  ) {}

  async getBtcPrice(): Promise<bigint> {
    return this.priceFeed.fetchBtcOraclePrice();
  }

  async getTcr(): Promise<{ tcr: bigint; recovery: boolean; price: bigint }> {
    const price = await this.priceFeed.fetchBtcOraclePrice();
    const { tcr, recovery } = await this.fetcher.getTCR(price);
    return { tcr, recovery, price };
  }

  async getSystemState(presetBtcPrice?: bigint) {
    const state = await this.fetcher.getSystemState();
    const btcPrice = presetBtcPrice
      ? presetBtcPrice
      : await this.priceFeed.fetchBtcOraclePrice();

    return {
      collateral: Number(formatUnits(state.collateral, 18)),
      debt: Number(formatUnits(state.debt, 18)),
      ratio:
        (Number(formatUnits(state.collateral, 18)) *
          Number(formatUnits(btcPrice, 18))) /
        Number(formatUnits(state.debt, 18)),
      btcPrice: Number(formatUnits(btcPrice, 18)),
    };
  }

  async getTrovesWithData(presetBtcPrice?: bigint, troveCount?: number) {
    const price = presetBtcPrice
      ? presetBtcPrice
      : await this.priceFeed.fetchBtcOraclePrice();
    let owners;
    if (troveCount)
      owners = await this.fetcher.getTroveOwners(BigInt(troveCount));
    else owners = await this.fetcher.getTroveOwners();
    const troves = await this.fetcher.getTrovesWithData(owners, price);

    return troves.map((trove) => {
      const collateral = Number(formatUnits(trove.collateral, 18));
      const principal = Number(formatUnits(trove.principal, 18));
      const interest = Number(formatUnits(trove.interest, 18));
      const icrRaw = Number(formatUnits(trove.ICR, 18));

      let collaterizationRatio = !Number.isFinite(icrRaw)
        ? Number.MAX_SAFE_INTEGER
        : icrRaw;

      return {
        owner: trove.owner,
        collateral,
        principal_debt: principal,
        interest,
        collaterizationRatio,
      };
    });
  }

  async getLiquidationsSinceBlock(
    fromBlock: number,
    chunkSize = 10_000
  ): Promise<TroveLiquidationEvent[]> {
    const logs = await this.fetcher.getEventLog("TroveLiquidated", {
      fromBlock: BigInt(fromBlock),
      chunkSize: BigInt(chunkSize),
    });
    return this._buildLiquidationEvents(
      logs as GetContractEventsReturnType<
        typeof TroveManagerAbi,
        "TroveLiquidated"
      >
    );
  }

  async getRedemptionsSinceBlock(
    fromBlock: number,
    chunkSize = 10_000
  ): Promise<TroveRedemptionEvent[]> {
    const logs = await this.fetcher.getEventLog("Redemption", {
      fromBlock: BigInt(fromBlock),
      chunkSize: BigInt(chunkSize),
    });
    if (logs.length === 0) {
      return [];
    }

    const redemptionBorrowersMap =
      await this.fetcher.getRedemptionBorrowersFromReceipts(logs);

    return this._buildRedemptionEvents(logs, redemptionBorrowersMap);
  }

  private async _buildRedemptionEvents(
    logs: GetContractEventsReturnType<typeof TroveManagerAbi, "Redemption">,
    redemptionBorrowersMap: Map<string, string[]>
  ): Promise<TroveRedemptionEvent[]> {
    if (logs.length === 0) {
      return [];
    }

    const timestampMap = await this.fetcher.buildBlockTimestampMap(logs);
    const statusMap = await this.fetcher.buildReceiptStatusMap(logs);

    const events = logs
      .map((log) => {
        const attempted = log.args._attemptedAmount as bigint;
        const actual = log.args._actualAmount as bigint;
        const collateralSent = log.args._collateralSent as bigint;
        const collateralFee = log.args._collateralFee as bigint;
        const blockNumber = log.blockNumber ?? 0n;
        const logIndex = log.logIndex ?? 0;

        return {
          attemptedAmount: Number(formatUnits(attempted, 18)),
          actualAmount: Number(formatUnits(actual, 18)),
          collateralSent: Number(formatUnits(collateralSent, 18)),
          collateralFee: Number(formatUnits(collateralFee, 18)),
          affectedBorrowers: log.transactionHash
            ? redemptionBorrowersMap.get(log.transactionHash) ?? []
            : [],
          txHash: log.transactionHash ?? "",
          blockNumber: Number(blockNumber),
          logIndex,
          timestamp: timestampMap.get(blockNumber) ?? 0,
          status: log.transactionHash
            ? statusMap.get(log.transactionHash) ?? "success"
            : "success",
        } satisfies TroveRedemptionEvent;
      })
      .filter(
        (event): event is TroveRedemptionEvent =>
          event !== null && !!event.txHash
      );

    return events.sort((a, b) => {
      if (a.blockNumber === b.blockNumber) {
        return a.logIndex - b.logIndex;
      }
      return a.blockNumber - b.blockNumber;
    });
  }

  private async _buildLiquidationEvents(
    logs: GetContractEventsReturnType<typeof TroveManagerAbi, "TroveLiquidated">
  ): Promise<TroveLiquidationEvent[]> {
    if (logs.length === 0) {
      return [];
    }

    const timestampMap = await this.fetcher.buildBlockTimestampMap(logs);
    const statusMap = await this.fetcher.buildReceiptStatusMap(logs);

    const events = logs
      .map((log) => {
        const borrower = log.args._borrower as string;
        const debt = log.args._debt as bigint;
        const collateral = log.args._coll as bigint;
        const operationRaw = log.args.operation as bigint | number | undefined;
        const blockNumber = log.blockNumber ?? 0n;
        const logIndex = log.logIndex ?? 0;

        return {
          borrower,
          debt: Number(formatUnits(debt, 18)),
          collateral: Number(formatUnits(collateral, 18)),
          operation:
            typeof operationRaw === "bigint"
              ? Number(operationRaw)
              : operationRaw ?? 0,
          txHash: log.transactionHash ?? "",
          blockNumber: Number(blockNumber),
          logIndex,
          timestamp: timestampMap.get(blockNumber) ?? 0,
          status: log.transactionHash
            ? statusMap.get(log.transactionHash) ?? "success"
            : "success",
        } satisfies TroveLiquidationEvent;
      })
      .filter(
        (event): event is TroveLiquidationEvent =>
          event !== null && !!event.txHash
      );

    return events.sort((a, b) => {
      if (a.blockNumber === b.blockNumber) {
        return a.logIndex - b.logIndex;
      }
      return a.blockNumber - b.blockNumber;
    });
  }
}
