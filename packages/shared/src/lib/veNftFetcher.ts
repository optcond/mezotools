import { formatUnits, isAddressEqual, parseAbiItem, PublicClient } from "viem";
import { getMezoContracts } from "../types";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
);

const VeNftAbi = [
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "uint256", name: "index", type: "uint256" },
    ],
    name: "tokenOfOwnerByIndex",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "uint256", name: "index", type: "uint256" },
    ],
    name: "ownerToNFTokenIdList",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "locked",
    outputs: [
      {
        components: [
          { internalType: "int128", name: "amount", type: "int128" },
          { internalType: "uint256", name: "end", type: "uint256" },
          { internalType: "bool", name: "isPermanent", type: "bool" },
        ],
        internalType: "struct IVotingEscrow.LockedBalance",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "_tokenId", type: "uint256" }],
    name: "votingPowerOfNFT",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalVotingPower",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "balanceOfNFT",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

type MulticallResult = {
  status: "success" | "failure";
  result?: unknown;
};

type LockedBalanceResult = {
  amount: bigint | number | string;
  end: bigint | number | string;
  isPermanent?: boolean;
};

export interface VeNftLock {
  escrow: "veBTC" | "veMEZO";
  contractAddress: `0x${string}`;
  tokenId: bigint;
  lockedAmount: bigint | null;
  lockedAmountFormatted: string | null;
  votingPower: bigint | null;
  votingPowerFormatted: string | null;
  unlockTime: bigint | null;
  isPermanent: boolean;
}

export interface WalletVeNftStats {
  locks: VeNftLock[];
  totalVotingPowerByAddress: Record<string, bigint | null>;
}

export interface WalletVeNftOptions {
  chainId?: number;
  veBTCAddress?: `0x${string}`;
  veMEZOAddress?: `0x${string}` | null;
  fromBlock?: bigint;
  logChunkSize?: bigint;
}

export const getWalletVeNfts = async (
  client: PublicClient,
  owner: `0x${string}`,
  options: WalletVeNftOptions = {}
): Promise<VeNftLock[]> => {
  const stats = await getWalletVeNftStats(client, owner, options);
  return stats.locks;
};

export const getWalletVeNftStats = async (
  client: PublicClient,
  owner: `0x${string}`,
  options: WalletVeNftOptions = {}
): Promise<WalletVeNftStats> => {
  const escrowContracts = getEscrowContracts(options);
  if (escrowContracts.length === 0) {
    return { locks: [], totalVotingPowerByAddress: {} };
  }

  const countAndTotalResults = (await client.multicall({
    allowFailure: true,
    contracts: escrowContracts.flatMap((contract) => [
      {
        address: contract.address,
        abi: VeNftAbi,
        functionName: "balanceOf",
        args: [owner],
      } as const,
      {
        address: contract.address,
        abi: VeNftAbi,
        functionName: "totalVotingPower",
      } as const,
    ]),
  })) as MulticallResult[];

  const rows = escrowContracts.map((contract, index) => {
    const countResult = countAndTotalResults[index * 2];
    const totalVotingPowerResult = countAndTotalResults[index * 2 + 1];

    return {
      ...contract,
      count:
        countResult?.status === "success" &&
        typeof countResult.result === "bigint"
          ? countResult.result
          : 0n,
      totalVotingPower:
        totalVotingPowerResult?.status === "success" &&
        typeof totalVotingPowerResult.result === "bigint"
          ? totalVotingPowerResult.result
          : null,
    };
  });

  const totalVotingPowerByAddress = Object.fromEntries(
    rows.map((row) => [row.address.toLowerCase(), row.totalVotingPower])
  );
  const tokenIdsByAddress = await getOwnedTokenIdsByContract(
    client,
    owner,
    rows,
    options
  );

  const detailRequests = rows.flatMap((row) =>
    (tokenIdsByAddress.get(row.address.toLowerCase()) ?? []).flatMap(
      (tokenId) => [
        {
          address: row.address,
          abi: VeNftAbi,
          functionName: "ownerOf",
          args: [tokenId],
        } as const,
        {
          address: row.address,
          abi: VeNftAbi,
          functionName: "locked",
          args: [tokenId],
        } as const,
        {
          address: row.address,
          abi: VeNftAbi,
          functionName: "balanceOfNFT",
          args: [tokenId],
        } as const,
        {
          address: row.address,
          abi: VeNftAbi,
          functionName: "votingPowerOfNFT",
          args: [tokenId],
        } as const,
      ]
    )
  );

  if (detailRequests.length === 0) {
    return { locks: [], totalVotingPowerByAddress };
  }

  const detailResults = (await client.multicall({
    allowFailure: true,
    contracts: detailRequests,
  })) as MulticallResult[];

  const locks: VeNftLock[] = [];
  let resultIndex = 0;
  rows.forEach((row) => {
    const tokenIds = tokenIdsByAddress.get(row.address.toLowerCase()) ?? [];
    tokenIds.forEach((tokenId) => {
      const ownerResult = detailResults[resultIndex];
      const lockedResult = detailResults[resultIndex + 1];
      const balanceOfNFTResult = detailResults[resultIndex + 2];
      const votingPowerOfNFTResult = detailResults[resultIndex + 3];
      resultIndex += 4;

      const lock = toVeNftLock({
        escrow: row.escrow,
        contractAddress: row.address,
        owner,
        tokenId,
        ownerResult,
        lockedResult,
        balanceOfNFTResult,
        votingPowerOfNFTResult,
      });
      if (lock) {
        locks.push(lock);
      }
    });
  });

  return { locks, totalVotingPowerByAddress };
};

const getEscrowContracts = (options: WalletVeNftOptions = {}) => {
  const contracts = getMezoContracts(options.chainId);
  return [
    {
      escrow: "veBTC" as const,
      address: options.veBTCAddress ?? contracts.veBTC,
    },
    {
      escrow: "veMEZO" as const,
      address: options.veMEZOAddress ?? contracts.veMEZO,
    },
  ].filter(
    (item): item is { escrow: "veBTC" | "veMEZO"; address: `0x${string}` } =>
      Boolean(item.address) && item.address !== "0x0"
  );
};

const toVeNftLock = ({
  escrow,
  contractAddress,
  owner,
  tokenId,
  ownerResult,
  lockedResult,
  balanceOfNFTResult,
  votingPowerOfNFTResult,
}: {
  escrow: "veBTC" | "veMEZO";
  contractAddress: `0x${string}`;
  owner: `0x${string}`;
  tokenId: bigint;
  ownerResult: MulticallResult | undefined;
  lockedResult: MulticallResult | undefined;
  balanceOfNFTResult: MulticallResult | undefined;
  votingPowerOfNFTResult: MulticallResult | undefined;
}): VeNftLock | null => {
  const currentOwner =
    ownerResult?.status === "success" && typeof ownerResult.result === "string"
      ? (ownerResult.result as `0x${string}`)
      : null;
  if (!currentOwner || !isAddressEqual(currentOwner, owner)) {
    return null;
  }
  const locked =
    lockedResult?.status === "success"
      ? (lockedResult.result as LockedBalanceResult | null)
      : null;
  const lockedAmount =
    locked && typeof locked === "object" && "amount" in locked
      ? BigInt(locked.amount)
      : null;
  const unlockTime =
    locked && typeof locked === "object" && "end" in locked
      ? BigInt(locked.end)
      : null;
  const isPermanent =
    locked && typeof locked === "object" && "isPermanent" in locked
      ? Boolean(locked.isPermanent)
      : false;
  // Prefer votingPowerOfNFT (handles permanent locks correctly); fall back to balanceOfNFT
  const votingPowerOfNFT =
    votingPowerOfNFTResult?.status === "success" &&
    typeof votingPowerOfNFTResult.result === "bigint"
      ? votingPowerOfNFTResult.result
      : null;
  const balanceOfNFT =
    balanceOfNFTResult?.status === "success" &&
    typeof balanceOfNFTResult.result === "bigint"
      ? balanceOfNFTResult.result
      : null;
  const votingPower = votingPowerOfNFT ?? balanceOfNFT;

  return {
    escrow,
    contractAddress,
    tokenId,
    lockedAmount,
    lockedAmountFormatted:
      lockedAmount !== null ? formatUnits(lockedAmount, 18) : null,
    votingPower,
    votingPowerFormatted:
      votingPower !== null ? formatUnits(votingPower, 18) : null,
    unlockTime,
    isPermanent,
  };
};

const getOwnedTokenIdsByContract = async (
  client: PublicClient,
  owner: `0x${string}`,
  rows: Array<{
    escrow: "veBTC" | "veMEZO";
    address: `0x${string}`;
    count: bigint;
  }>,
  options: Pick<WalletVeNftOptions, "fromBlock" | "logChunkSize">
): Promise<Map<string, bigint[]>> => {
  const result = new Map<string, bigint[]>();
  const rowsWithLocks = rows.filter((row) => row.count > 0n);

  rows.forEach((row) => result.set(row.address.toLowerCase(), []));
  if (rowsWithLocks.length === 0) {
    return result;
  }

  const ownerListCalls = rowsWithLocks.flatMap((row) =>
    Array.from({ length: Number(row.count) }, (_, index) => ({
      address: row.address,
      abi: VeNftAbi,
      functionName: "ownerToNFTokenIdList",
      args: [owner, BigInt(index)],
    }))
  );

  const ownerListResults = (await client.multicall({
    allowFailure: true,
    contracts: ownerListCalls,
  })) as MulticallResult[];

  let cursor = 0;
  const fallbackRows: typeof rowsWithLocks = [];
  rowsWithLocks.forEach((row) => {
    const count = Number(row.count);
    const tokenIds = tokenIdsFromResults(
      ownerListResults.slice(cursor, cursor + count)
    );
    cursor += count;

    if (tokenIds.length > 0) {
      result.set(row.address.toLowerCase(), tokenIds);
    } else {
      fallbackRows.push(row);
    }
  });

  if (fallbackRows.length === 0) {
    return result;
  }

  const enumerableCalls = fallbackRows.flatMap((row) =>
    Array.from({ length: Number(row.count) }, (_, index) => ({
      address: row.address,
      abi: VeNftAbi,
      functionName: "tokenOfOwnerByIndex",
      args: [owner, BigInt(index)],
    }))
  );

  const enumerableResults = (await client.multicall({
    allowFailure: true,
    contracts: enumerableCalls,
  })) as MulticallResult[];

  cursor = 0;
  const logFallbackRows: typeof fallbackRows = [];
  fallbackRows.forEach((row) => {
    const count = Number(row.count);
    const tokenIds = tokenIdsFromResults(
      enumerableResults.slice(cursor, cursor + count)
    );
    cursor += count;

    if (tokenIds.length > 0) {
      result.set(row.address.toLowerCase(), tokenIds);
    } else {
      logFallbackRows.push(row);
    }
  });

  if (logFallbackRows.length === 0) {
    return result;
  }

  const logTokenIds = await Promise.all(
    logFallbackRows.map((row) =>
      getTokenIdsFromTransferLogs(client, owner, row.address, options)
    )
  );
  logFallbackRows.forEach((row, index) => {
    result.set(row.address.toLowerCase(), logTokenIds[index]);
  });

  return result;
};

const tokenIdsFromResults = (results: MulticallResult[]) =>
  results
    .map((result) =>
      result.status === "success" && typeof result.result === "bigint"
        ? result.result
        : null
    )
    .filter((tokenId): tokenId is bigint => tokenId !== null);

const getTokenIdsFromTransferLogs = async (
  client: PublicClient,
  owner: `0x${string}`,
  contractAddress: `0x${string}`,
  options: Pick<WalletVeNftOptions, "fromBlock" | "logChunkSize">
): Promise<bigint[]> => {
  const fromBlock = options.fromBlock ?? 0n;
  const logChunkSize = options.logChunkSize ?? 10_000n;
  const latestBlock = await client.getBlockNumber();
  const tokenIds = new Set<string>();

  let cursor = fromBlock;
  while (cursor <= latestBlock) {
    const toBlock =
      cursor + logChunkSize - 1n > latestBlock
        ? latestBlock
        : cursor + logChunkSize - 1n;

    const [incoming, outgoing] = await Promise.all([
      client.getLogs({
        address: contractAddress,
        event: TRANSFER_EVENT,
        args: { to: owner },
        fromBlock: cursor,
        toBlock,
      }),
      client.getLogs({
        address: contractAddress,
        event: TRANSFER_EVENT,
        args: { from: owner },
        fromBlock: cursor,
        toBlock,
      }),
    ]);

    [...incoming, ...outgoing].forEach((log) => {
      const tokenId = log.args.tokenId;
      if (typeof tokenId === "bigint") {
        tokenIds.add(tokenId.toString());
      }
    });

    cursor = toBlock + 1n;
  }

  return Array.from(tokenIds, (tokenId) => BigInt(tokenId));
};

export const getEscrowTotalVotingPower = async (
  client: PublicClient,
  options: WalletVeNftOptions = {}
): Promise<Record<string, bigint | null>> => {
  const contracts = getMezoContracts(options.chainId);
  const escrows = [
    { address: options.veBTCAddress ?? contracts.veBTC },
    {
      address:
        options.veMEZOAddress !== undefined
          ? options.veMEZOAddress
          : contracts.veMEZO,
    },
  ].filter(
    (e): e is { address: `0x${string}` } =>
      Boolean(e.address) && e.address !== "0x0"
  );

  if (escrows.length === 0) return {};

  const results = await client.multicall({
    allowFailure: true,
    contracts: escrows.map((e) => ({
      address: e.address,
      abi: VeNftAbi,
      functionName: "totalVotingPower" as const,
    })),
  });

  return Object.fromEntries(
    escrows.map((e, i) => [
      e.address.toLowerCase(),
      results[i].status === "success" ? (results[i].result as bigint) : null,
    ])
  );
};
