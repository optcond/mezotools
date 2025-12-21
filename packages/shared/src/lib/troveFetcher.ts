import {
  Abi,
  formatUnits,
  PublicClient,
  ContractEventName,
  parseUnits,
  GetContractEventsReturnType,
  decodeEventLog,
} from "viem";
import { AppContracts } from "../types";
import { TroveManagerAbi } from "../abi/TroveManager";
import {
  Status,
  TroveData,
  TroveLiquidationEvent,
  TroveRedemptionEvent,
} from "../trove.types";
import { BorrowerOperationsAbi } from "../abi/BorrowerOperations";

const DEFAULT_CHUNK_SIZE = 10_000n;

export class TroveFetcher {
  private readonly abi = TroveManagerAbi;
  constructor(
    private readonly client: PublicClient,
    private readonly contractAddress = AppContracts.MEZO_TROVE_MANAGER as `0x${string}`,
    private readonly borrowerOperationsCA = AppContracts.MEZO_BORROWER_OPERATIONS as `0x${string}`
  ) {}

  async getPriceFeedAddress() {
    return await this.client.readContract({
      address: this.contractAddress as `0x${string}`,
      abi: this.abi,
      functionName: "priceFeed",
    });
  }

  async getSystemState() {
    const requests = [
      "getEntireSystemColl",
      "getEntireSystemDebt",
      "getTroveOwnersCount",
    ] as const;
    const calls = requests.map((fn) => {
      return {
        address: this.contractAddress as `0x${string}`,
        abi: this.abi,
        functionName: fn,
      };
    });
    const response = await this.client.multicall({
      contracts: calls,
    });
    if (!response.every((r) => r.status === "success")) {
      throw new Error("Failed to fetch system debt and collateral");
    }

    return {
      collateral: response[0].result,
      debt: response[1].result,
      troveOwnersCount: response[2].result,
    };
  }

  async getTCR(price: bigint): Promise<{ tcr: bigint; recovery: boolean }> {
    const calls = [
      {
        address: this.contractAddress as `0x${string}`,
        abi: this.abi,
        functionName: "getTCR",
        args: [price],
      },
      {
        address: this.contractAddress as `0x${string}`,
        abi: this.abi,
        functionName: "checkRecoveryMode",
        args: [price],
      },
    ] as const;
    const response = await this.client.multicall({
      contracts: calls,
    });

    if (!response.every((r) => r.status === "success")) {
      throw new Error("Failed to fetch system debt and collateral");
    }

    return {
      tcr: response[0].result as bigint,
      recovery: response[1].result as boolean,
    };
  }

  async getTroveOwnersCount(): Promise<bigint> {
    return this.client.readContract({
      abi: TroveManagerAbi,
      address: this.contractAddress,
      functionName: "getTroveOwnersCount",
    });
  }

  async getTroveOwners(troveCount?: bigint): Promise<string[]> {
    if (!troveCount) {
      troveCount = await this.getTroveOwnersCount();
    }

    let calls: {
      address: `0x${string}`;
      abi: Abi;
      functionName: "getTroveFromTroveOwnersArray";
      args: [bigint];
    }[] = [];

    for (let i = 0n; i < troveCount; i++) {
      calls.push({
        address: this.contractAddress,
        abi: TroveManagerAbi,
        functionName: "getTroveFromTroveOwnersArray",
        args: [i],
      });
    }
    const response = await this.client.multicall({
      contracts: calls,
    });

    return response.map((r) => r.result as string);
  }

  async getTrovesWithData(
    troveAddresses: string[],
    price: bigint
  ): Promise<TroveData[]> {
    const calls: {
      abi: Abi;
      address: `0x${string}`;
      functionName:
        | "getEntireDebtAndColl"
        | "getTroveStatus"
        | "getTroveStake"
        | "getTroveInterestRate"
        | "getTroveLastInterestUpdateTime"
        | "getCurrentICR";
      args: any[];
    }[] = troveAddresses.flatMap((trove) => [
      {
        abi: TroveManagerAbi,
        address: this.contractAddress,
        functionName: "getEntireDebtAndColl",
        args: [trove],
      },
      {
        abi: TroveManagerAbi,
        address: this.contractAddress,
        functionName: "getTroveStatus",
        args: [trove],
      },
      {
        abi: TroveManagerAbi,
        address: this.contractAddress,
        functionName: "getTroveStake",
        args: [trove],
      },
      {
        abi: TroveManagerAbi,
        address: this.contractAddress,
        functionName: "getTroveInterestRate",
        args: [trove],
      },
      {
        abi: TroveManagerAbi,
        address: this.contractAddress,
        functionName: "getTroveLastInterestUpdateTime",
        args: [trove],
      },
      {
        abi: TroveManagerAbi,
        address: this.contractAddress,
        functionName: "getCurrentICR",
        args: [trove, price],
      },
    ]);

    const response = await this.client.multicall({
      contracts: calls,
    });

    const troves: TroveData[] = [];
    let idx = 0;
    for (let i = 0; i < troveAddresses.length; i++) {
      const rDebtColl = response[idx++];
      const rStatus = response[idx++];
      const rStake = response[idx++];
      const rIR = response[idx++];
      const rIRUpdated = response[idx++];
      const rICR = response[idx++];

      if (
        !(
          rDebtColl.status === "success" &&
          rStatus.status === "success" &&
          rStake.status === "success"
        )
      )
        continue;

      const [
        coll,
        principal,
        interest,
        pendingCollateral,
        pendingPrincipal,
        pendingInterest,
      ] = rDebtColl.result as unknown as [
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint
      ];
      const statusRaw = rStatus.result as bigint;
      const stake = rStake.result as bigint;

      let interestRate: bigint = 0n;
      if (rIR.status === "success" && rIR.result !== "0x") {
        try {
          interestRate = rIR.result as bigint;
        } catch {}
      }

      let lastInterestUpdateTime: bigint = 0n;
      if (rIRUpdated.status === "success" && rIRUpdated.result !== "0x") {
        try {
          lastInterestUpdateTime = rIRUpdated.result as bigint;
        } catch {}
      }

      let ICR: bigint = 0n;
      if (rICR.status === "success" && rICR.result !== "0x") {
        try {
          ICR = rICR.result as bigint;
        } catch {}
      }
      const status = statusRaw === 1n ? Status.active : Status.nonExistent;

      troves.push({
        owner: troveAddresses[i],
        collateral: coll,
        principal,
        interest,
        stake,
        status,
        interestRate,
        lastInterestUpdateTime,
        pendingCollateral,
        pendingPrincipal,
        pendingInterest,
        ICR,
      });
    }
    return troves;
  }

  async getEventLog<
    E extends ContractEventName<
      typeof TroveManagerAbi | typeof BorrowerOperationsAbi
    >
  >(
    eventName: E,
    options: {
      fromBlock?: bigint;
      toBlock?: bigint;
      chunkSize?: bigint;
    },
    _abi: "troveManager" | "borrowerOperations" = "troveManager"
  ): Promise<
    GetContractEventsReturnType<
      typeof TroveManagerAbi | typeof BorrowerOperationsAbi,
      E
    >
  > {
    let startBlock = options.fromBlock ?? 0n;
    let toBlock = options.toBlock ?? (await this.client.getBlockNumber());
    let chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;

    let abi = _abi == "troveManager" ? TroveManagerAbi : BorrowerOperationsAbi;
    let ca =
      _abi == "troveManager" ? this.contractAddress : this.borrowerOperationsCA;

    if (startBlock > toBlock) return [];

    let logs: GetContractEventsReturnType<
      typeof TroveManagerAbi | typeof BorrowerOperationsAbi,
      E
    > = [];
    let cursor = startBlock;
    while (cursor <= toBlock) {
      const end =
        cursor + chunkSize - 1n > toBlock ? toBlock : cursor + chunkSize - 1n;
      const chunk = await this.client.getContractEvents({
        address: ca,
        abi: abi,
        eventName,
        fromBlock: cursor,
        toBlock: end,
      });
      cursor = end + 1n;

      logs = [...logs, ...chunk];
    }

    logs.sort((a, b) => {
      const blockDiff = (a.blockNumber ?? 0n) - (b.blockNumber ?? 0n);
      if (blockDiff !== 0n) return blockDiff > 0n ? 1 : -1;

      const aIndex = a.logIndex ?? 0;
      const bIndex = b.logIndex ?? 0;
      return aIndex - bIndex;
    });

    return logs;
  }

  async buildBlockTimestampMap<
    E extends ContractEventName<typeof TroveManagerAbi>
  >(
    logs: GetContractEventsReturnType<typeof TroveManagerAbi, E>
  ): Promise<Map<bigint, number>> {
    const blockNumbers = [
      ...new Set(
        logs
          .map((log) => log.blockNumber)
          .filter((bn): bn is bigint => bn !== undefined && bn !== null)
      ),
    ];

    const blocks = await Promise.all(
      blockNumbers.map((blockNumber) => this.client.getBlock({ blockNumber }))
    );

    const timestampMap = new Map<bigint, number>();
    blockNumbers.forEach((blockNumber, index) => {
      const block = blocks[index];
      const timestamp =
        block && typeof block.timestamp === "number"
          ? block.timestamp
          : Number(block?.timestamp ?? 0);
      timestampMap.set(blockNumber, timestamp);
    });

    return timestampMap;
  }

  async buildReceiptStatusMap<
    E extends ContractEventName<typeof TroveManagerAbi>
  >(
    logs: GetContractEventsReturnType<typeof TroveManagerAbi, E>
  ): Promise<Map<string, "success" | "failed">> {
    const txHashes = [
      ...new Set(
        logs
          .map((log) => log.transactionHash)
          .filter((hash): hash is `0x${string}` => !!hash)
      ),
    ];

    const receipts = await Promise.all(
      txHashes.map(async (hash) => {
        try {
          const receipt = await this.client.getTransactionReceipt({ hash });
          if (!receipt) {
            return [hash, "success" as const];
          }
          return [
            hash,
            receipt.status === "success"
              ? ("success" as const)
              : ("failed" as const),
          ];
        } catch (error) {
          console.warn("Failed to fetch transaction receipt", { hash, error });
          return [hash, "failed" as const];
        }
      })
    );

    return new Map(receipts as Array<[string, "success" | "failed"]>);
  }

  async getRedemptionBorrowersFromReceipts(
    logs: GetContractEventsReturnType<typeof TroveManagerAbi, "Redemption">
  ): Promise<Map<string, string[]>> {
    const txHashes = [
      ...new Set(
        logs
          .map((log) => log.transactionHash)
          .filter((hash): hash is `0x${string}` => !!hash)
      ),
    ];

    const redemptionBorrowers = new Map<string, string[]>();
    await Promise.all(
      txHashes.map(async (hash) => {
        try {
          const receipt = await this.client.getTransactionReceipt({ hash });
          if (!receipt) {
            return;
          }

          receipt.logs.forEach((log) => {
            if (
              !log.address ||
              log.address.toLowerCase() !== this.contractAddress.toLowerCase()
            ) {
              return;
            }

            try {
              const decoded = decodeEventLog({
                abi: TroveManagerAbi,
                data: log.data,
                topics: log.topics,
              });

              if (decoded.eventName !== "TroveUpdated") {
                return;
              }

              const operation = decoded.args?.operation as
                | bigint
                | number
                | undefined;
              const borrower = decoded.args?._borrower as string | undefined;
              if (!borrower) return;

              const opNumber =
                typeof operation === "bigint"
                  ? Number(operation)
                  : operation ?? Number.NaN;
              if (Number.isNaN(opNumber) || opNumber !== 2) {
                return;
              }

              const existing = redemptionBorrowers.get(hash) ?? [];
              existing.push(borrower);
              redemptionBorrowers.set(hash, existing);
            } catch (error) {
              // Ignore logs that cannot be decoded with the TroveManager ABI
            }
          });
        } catch (error) {
          console.warn(
            "Failed to fetch transaction receipt when deriving redemption borrowers",
            {
              hash,
              error,
            }
          );
        }
      })
    );

    return redemptionBorrowers;
  }

  static computeTroveICR(trove: TroveData, price: bigint): bigint | null {
    const totalCollateral = trove.collateral + trove.pendingCollateral;
    const totalDebt =
      trove.principal +
      trove.interest +
      trove.pendingPrincipal +
      trove.pendingInterest;

    if (totalDebt === 0n) {
      return null;
    }

    return (totalCollateral * price) / totalDebt;
  }
}
