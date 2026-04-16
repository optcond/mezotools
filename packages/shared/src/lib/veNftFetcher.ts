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
  const contracts = getMezoContracts(options.chainId);
  const escrowContracts = [
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

  const nestedLocks = await Promise.all(
    escrowContracts.map((contract) =>
      getWalletVeNftsForContract(
        client,
        owner,
        contract.escrow,
        contract.address,
        options
      )
    )
  );

  return nestedLocks.flat();
};

const getWalletVeNftsForContract = async (
  client: PublicClient,
  owner: `0x${string}`,
  escrow: "veBTC" | "veMEZO",
  contractAddress: `0x${string}`,
  options: Pick<WalletVeNftOptions, "fromBlock" | "logChunkSize"> = {}
): Promise<VeNftLock[]> => {
  try {
    const tokenIds = await getOwnedTokenIds(client, owner, contractAddress, options);

    // 4 calls per token: ownerOf, locked, balanceOfNFT, votingPowerOfNFT
    const detailResults = (await client.multicall({
      allowFailure: true,
      contracts: tokenIds.flatMap((tokenId) => [
        {
          address: contractAddress,
          abi: VeNftAbi,
          functionName: "ownerOf",
          args: [tokenId],
        } as const,
        {
          address: contractAddress,
          abi: VeNftAbi,
          functionName: "locked",
          args: [tokenId],
        } as const,
        {
          address: contractAddress,
          abi: VeNftAbi,
          functionName: "balanceOfNFT",
          args: [tokenId],
        } as const,
        {
          address: contractAddress,
          abi: VeNftAbi,
          functionName: "votingPowerOfNFT",
          args: [tokenId],
        } as const,
      ]),
    })) as MulticallResult[];

    return tokenIds.map((tokenId, index) => {
      const ownerResult = detailResults[index * 4];
      const lockedResult = detailResults[index * 4 + 1];
      const balanceOfNFTResult = detailResults[index * 4 + 2];
      const votingPowerOfNFTResult = detailResults[index * 4 + 3];
      const currentOwner =
        ownerResult?.status === "success" &&
        typeof ownerResult.result === "string"
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
    }).filter((lock): lock is VeNftLock => lock !== null);
  } catch {
    return [];
  }
};

const getOwnedTokenIds = async (
  client: PublicClient,
  owner: `0x${string}`,
  contractAddress: `0x${string}`,
  options: Pick<WalletVeNftOptions, "fromBlock" | "logChunkSize">
): Promise<bigint[]> => {
  const count = await getNftCount(client, owner, contractAddress);
  if (count === 0n) {
    return [];
  }

  const enumerableTokenIds = await tryGetEnumerableTokenIds(
    client,
    owner,
    contractAddress,
    count
  );
  if (enumerableTokenIds.length > 0) {
    return enumerableTokenIds;
  }

  return getTokenIdsFromTransferLogs(client, owner, contractAddress, options);
};

const tryGetEnumerableTokenIds = async (
  client: PublicClient,
  owner: `0x${string}`,
  contractAddress: `0x${string}`,
  count: bigint
): Promise<bigint[]> => {
  try {
    const tokenIdResults = (await client.multicall({
      allowFailure: true,
      contracts: Array.from({ length: Number(count) }, (_, index) => ({
        address: contractAddress,
        abi: VeNftAbi,
        functionName: "ownerToNFTokenIdList",
        args: [owner, BigInt(index)],
      })),
    })) as MulticallResult[];

    const ownerListTokenIds = tokenIdResults
      .map((result) =>
        result.status === "success" && typeof result.result === "bigint"
          ? result.result
          : null
      )
      .filter((tokenId): tokenId is bigint => tokenId !== null);
    if (ownerListTokenIds.length > 0) {
      return ownerListTokenIds;
    }

    const enumerableResults = (await client.multicall({
      allowFailure: true,
      contracts: Array.from({ length: Number(count) }, (_, index) => ({
        address: contractAddress,
        abi: VeNftAbi,
        functionName: "tokenOfOwnerByIndex",
        args: [owner, BigInt(index)],
      })),
    })) as MulticallResult[];

    return enumerableResults
      .map((result) =>
        result.status === "success" && typeof result.result === "bigint"
          ? result.result
          : null
      )
      .filter((tokenId): tokenId is bigint => tokenId !== null);
  } catch {
    return [];
  }
};

const getNftCount = async (
  client: PublicClient,
  owner: `0x${string}`,
  contractAddress: `0x${string}`
): Promise<bigint> => {
  try {
    return (await client.readContract({
      address: contractAddress,
      abi: VeNftAbi,
      functionName: "balanceOf",
      args: [owner],
    })) as bigint;
  } catch {
    return 0n;
  }
};

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
