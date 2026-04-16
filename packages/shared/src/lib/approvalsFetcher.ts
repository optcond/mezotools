import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  parseAbiItem,
  type Address,
  type Hex,
} from "viem";
import { MEZO_EXPLORER_API_BASE_URL } from "../types";

export interface MezoExplorerClientOptions {
  explorerApiBaseUrl?: string;
  rpcUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface ExplorerPageParams {
  block_number?: number;
  index?: number;
  items_count?: number;
}

export interface ExplorerResponse<T> {
  items: T[];
  next_page_params?: ExplorerPageParams | null;
}

export interface ExplorerLogAddressRef {
  hash?: Address;
  is_contract?: boolean;
  implementation_name?: string | null;
  name?: string | null;
}

export interface ExplorerLogTopicDecodedParameter {
  name?: string;
  type?: string;
  value?: string;
}

export interface ExplorerLogTopicDecoded {
  method_call?: string;
  method_id?: string;
  parameters?: ExplorerLogTopicDecodedParameter[];
}

export interface ExplorerLogItem {
  address: ExplorerLogAddressRef | string;
  block_number: number;
  data: Hex;
  decoded?: ExplorerLogTopicDecoded | null;
  index: number;
  smart_contract?: {
    address_hash?: Address;
    name?: string | null;
    token_name?: string | null;
    token_symbol?: string | null;
  } | null;
  topics: Hex[];
  transaction_hash: Hex;
}

export interface ApprovalCandidate {
  token: Address;
  owner: Address;
  spender: Address;
  value: bigint;
  transactionHash: Hex;
  blockNumber: number;
  logIndex: number;
}

export interface ActiveAllowance extends ApprovalCandidate {
  currentAllowance: bigint;
  tokenSymbol?: string;
  tokenDecimals?: number;
}

export interface FetchApprovalsOptions {
  pageSize?: number;
  maxPages?: number;
  fromBlock?: bigint;
  toBlock?: bigint;
  blockRangeSize?: bigint;
  preferRpcLogs?: boolean;
  allowExplorerFallback?: boolean;
  signal?: AbortSignal;
}

export interface FetchActiveAllowancesOptions extends FetchApprovalsOptions {
  minAllowance?: bigint;
}

export interface KnownApprovalToken {
  symbol: string;
  address: Address;
  decimals: number;
}

type ApprovalEventLog = {
  eventName?: string;
  args?: {
    owner?: Address;
    spender?: Address;
    value?: bigint;
  };
};

type RpcApprovalLog = {
  address: Address;
  args?: {
    owner?: Address;
    spender?: Address;
    value?: bigint;
  };
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex: number;
};

const ERC20_APPROVAL_EVENT = parseAbiItem(
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
);

type InternalFetch = typeof fetch;

export class MezoUserApprovalsClient {
  private readonly explorerApiBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: InternalFetch;
  private readonly publicClient;

  constructor(options: MezoExplorerClientOptions) {
    this.explorerApiBaseUrl = (
      options.explorerApiBaseUrl ?? MEZO_EXPLORER_API_BASE_URL
    ).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.fetchImpl =
      options.fetchImpl ??
      (typeof globalThis.fetch === "function"
        ? globalThis.fetch.bind(globalThis)
        : (() => {
            throw new Error("Fetch API is not available.");
          }));

    this.publicClient = createPublicClient({
      transport: http(options.rpcUrl),
    });
  }

  async fetchApprovalLogsForUser(
    user: Address,
    options: FetchApprovalsOptions = {},
  ): Promise<ApprovalCandidate[]> {
    const owner = getAddress(user);
    const pageSize = options.pageSize ?? 50;
    const maxPages = options.maxPages ?? 20;

    const results: ApprovalCandidate[] = [];
    let nextPageParams: ExplorerPageParams | null | undefined = undefined;

    for (let page = 0; page < maxPages; page++) {
      const response = await this.getAddressLogs(owner, {
        pageSize,
        nextPageParams,
        signal: options.signal,
      });

      for (const item of response.items) {
        const parsed = this.tryParseApprovalLog(item);
        if (!parsed) continue;
        if (parsed.owner !== owner) continue;
        results.push(parsed);
      }

      if (!response.next_page_params) break;
      nextPageParams = response.next_page_params;
    }

    return this.dedupeLatestApprovalEvents(results);
  }

  async fetchApprovalLogsForKnownTokens(
    user: Address,
    tokens: KnownApprovalToken[],
    options: FetchApprovalsOptions = {},
  ): Promise<ApprovalCandidate[]> {
    const owner = getAddress(user);
    if (options.preferRpcLogs !== false) {
      try {
        return await this.fetchApprovalLogsForKnownTokensViaRpc(
          owner,
          tokens,
          options,
        );
      } catch (err) {
        if (!options.allowExplorerFallback) {
          throw err;
        }
        // Explicit opt-in fallback only. This path paginates token logs and can
        // be very expensive for popular ERC-20 contracts.
      }
    }

    const results = await Promise.all(
      tokens.map((token) =>
        this.fetchApprovalLogsForToken(owner, token.address, options),
      ),
    );

    return this.dedupeLatestApprovalEvents(results.flat());
  }

  async fetchActiveAllowancesForUser(
    user: Address,
    options: FetchActiveAllowancesOptions = {},
  ): Promise<ActiveAllowance[]> {
    const minAllowance = options.minAllowance ?? 1n;
    const approvals = await this.fetchApprovalLogsForUser(user, options);

    const allowances = await Promise.all(
      approvals.map(async (approval): Promise<ActiveAllowance | null> => {
        try {
          const currentAllowance = await this.readAllowance(
            approval.token,
            approval.owner,
            approval.spender,
          );

          if (currentAllowance < minAllowance) return null;

          return {
            ...approval,
            currentAllowance,
          };
        } catch {
          return null;
        }
      }),
    );

    return allowances.filter((item): item is ActiveAllowance => item !== null);
  }

  async fetchActiveAllowancesForApprovalCandidates(
    approvals: ApprovalCandidate[],
    tokens: KnownApprovalToken[] = [],
    options: FetchActiveAllowancesOptions = {},
  ): Promise<ActiveAllowance[]> {
    const minAllowance = options.minAllowance ?? 1n;
    const tokenMetaByAddress = new Map(
      tokens.map((token) => [
        getAddress(token.address),
        { symbol: token.symbol, decimals: token.decimals },
      ]),
    );
    const dedupedApprovals = this.dedupeLatestApprovalEvents(approvals);

    const allowances = await Promise.all(
      dedupedApprovals.map(async (approval): Promise<ActiveAllowance | null> => {
        try {
          const currentAllowance = await this.readAllowance(
            approval.token,
            approval.owner,
            approval.spender,
          );

          if (currentAllowance < minAllowance) return null;

          const tokenMeta = tokenMetaByAddress.get(getAddress(approval.token));

          return {
            ...approval,
            currentAllowance,
            tokenSymbol: tokenMeta?.symbol,
            tokenDecimals: tokenMeta?.decimals,
          };
        } catch {
          return null;
        }
      }),
    );

    return allowances.filter((item): item is ActiveAllowance => item !== null);
  }

  async fetchActiveAllowancesForKnownTokens(
    user: Address,
    tokens: KnownApprovalToken[],
    options: FetchActiveAllowancesOptions = {},
  ): Promise<ActiveAllowance[]> {
    const approvals = await this.fetchApprovalLogsForKnownTokens(
      user,
      tokens,
      options,
    );

    return this.fetchActiveAllowancesForApprovalCandidates(
      approvals,
      tokens,
      options,
    );
  }

  async getBlockNumber(): Promise<bigint> {
    return this.publicClient.getBlockNumber();
  }

  async readAllowance(
    token: Address,
    owner: Address,
    spender: Address,
  ): Promise<bigint> {
    const result = await this.publicClient.readContract({
      address: getAddress(token),
      abi: [
        {
          type: "function",
          name: "allowance",
          stateMutability: "view",
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          outputs: [{ name: "", type: "uint256" }],
        },
      ],
      functionName: "allowance",
      args: [getAddress(owner), getAddress(spender)],
    });

    return result;
  }

  private async getAddressLogs(
    address: Address,
    params: {
      pageSize: number;
      nextPageParams?: ExplorerPageParams | null;
      signal?: AbortSignal;
    },
  ): Promise<ExplorerResponse<ExplorerLogItem>> {
    const url = new URL(
      `${this.explorerApiBaseUrl}/addresses/${getAddress(address)}/logs`,
    );
    url.searchParams.set("items_count", String(params.pageSize));

    if (params.nextPageParams?.block_number != null) {
      url.searchParams.set(
        "block_number",
        String(params.nextPageParams.block_number),
      );
    }
    if (params.nextPageParams?.index != null) {
      url.searchParams.set("index", String(params.nextPageParams.index));
    }
    if (params.nextPageParams?.items_count != null) {
      url.searchParams.set(
        "items_count",
        String(params.nextPageParams.items_count),
      );
    }

    return this.getJson<ExplorerResponse<ExplorerLogItem>>(
      url.toString(),
      params.signal,
    );
  }

  private async fetchApprovalLogsForToken(
    owner: Address,
    token: Address,
    options: FetchApprovalsOptions,
  ): Promise<ApprovalCandidate[]> {
    const pageSize = options.pageSize ?? 50;
    const maxPages = options.maxPages ?? 20;
    const tokenAddress = getAddress(token);
    const results: ApprovalCandidate[] = [];
    let nextPageParams: ExplorerPageParams | null | undefined = undefined;

    for (let page = 0; page < maxPages; page++) {
      const response = await this.getAddressLogs(tokenAddress, {
        pageSize,
        nextPageParams,
        signal: options.signal,
      });

      for (const item of response.items) {
        const parsed = this.tryParseApprovalLog(item);
        if (!parsed) continue;
        if (parsed.token !== tokenAddress) continue;
        if (parsed.owner !== owner) continue;
        results.push(parsed);
      }

      if (!response.next_page_params) break;
      nextPageParams = response.next_page_params;
    }

    return results;
  }

  private async fetchApprovalLogsForKnownTokensViaRpc(
    owner: Address,
    tokens: KnownApprovalToken[],
    options: FetchApprovalsOptions,
  ): Promise<ApprovalCandidate[]> {
    const tokenAddresses = tokens.map((token) => getAddress(token.address));
    if (tokenAddresses.length === 0) return [];

    const fromBlock = options.fromBlock ?? 0n;
    const latestBlock = options.toBlock ?? (await this.publicClient.getBlockNumber());
    const blockRangeSize = options.blockRangeSize ?? 1_000_000n;
    const results: ApprovalCandidate[] = [];

    for (
      let rangeStart = fromBlock;
      rangeStart <= latestBlock;
      rangeStart += blockRangeSize + 1n
    ) {
      if (options.signal?.aborted) {
        throw new Error("Approval scan was aborted.");
      }

      const rangeEnd =
        rangeStart + blockRangeSize > latestBlock
          ? latestBlock
          : rangeStart + blockRangeSize;
      const logs = (await this.publicClient.getLogs({
        address: tokenAddresses,
        event: ERC20_APPROVAL_EVENT,
        args: { owner },
        fromBlock: rangeStart,
        toBlock: rangeEnd,
      })) as RpcApprovalLog[];

      for (const log of logs) {
        if (!log.args?.owner || !log.args.spender || log.args.value == null) {
          continue;
        }

        results.push({
          token: getAddress(log.address),
          owner: getAddress(log.args.owner),
          spender: getAddress(log.args.spender),
          value: log.args.value,
          transactionHash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
          logIndex: Number(log.logIndex),
        });
      }
    }

    return this.dedupeLatestApprovalEvents(results);
  }

  private tryParseApprovalLog(log: ExplorerLogItem): ApprovalCandidate | null {
    try {
      const contractAddress = this.extractLogAddress(log.address);
      if (!contractAddress) return null;
      if (!Array.isArray(log.topics) || log.topics.length < 3) return null;
      const topics = log.topics as [Hex, ...Hex[]];

      const decoded = decodeEventLog({
        abi: [ERC20_APPROVAL_EVENT],
        data: log.data,
        topics,
      }) as ApprovalEventLog;

      if (decoded.eventName !== "Approval") return null;
      if (!decoded.args) return null;

      const owner = decoded.args.owner ? getAddress(decoded.args.owner) : null;
      const spender = decoded.args.spender
        ? getAddress(decoded.args.spender)
        : null;
      const value = decoded.args.value ?? null;

      if (!owner || !spender || value == null) return null;

      return {
        token: contractAddress,
        owner,
        spender,
        value,
        transactionHash: log.transaction_hash,
        blockNumber: Number(log.block_number),
        logIndex: Number(log.index),
      };
    } catch {
      return null;
    }
  }

  private dedupeLatestApprovalEvents(
    items: ApprovalCandidate[],
  ): ApprovalCandidate[] {
    const map = new Map<string, ApprovalCandidate>();

    for (const item of items) {
      const key = `${item.token}:${item.owner}:${item.spender}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, item);
        continue;
      }

      const isNewer =
        item.blockNumber > existing.blockNumber ||
        (item.blockNumber === existing.blockNumber &&
          item.logIndex > existing.logIndex);

      if (isNewer) {
        map.set(key, item);
      }
    }

    return [...map.values()];
  }

  private extractLogAddress(value: ExplorerLogItem["address"]): Address | null {
    if (typeof value === "string") {
      return this.safeAddress(value);
    }

    if (value?.hash) {
      return this.safeAddress(value.hash);
    }

    return null;
  }

  private safeAddress(value: string): Address | null {
    try {
      return getAddress(value);
    } catch {
      return null;
    }
  }

  private async getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);

    try {
      const res = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(
          `Explorer request failed: ${res.status} ${res.statusText}`,
        );
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
