import type { Hex } from "viem";

export interface BlockscoutLog {
  address: Hex;
  blockNumber: number;
  data: Hex;
  logIndex: number;
  topics: Hex[];
  transactionHash: Hex;
}

interface RawBlockscoutLog {
  address?: string;
  blockNumber?: string | number;
  data?: string;
  logIndex?: string | number;
  topics?: string[];
  transactionHash?: string;
}

interface BlockscoutLogsResponse {
  status?: string;
  message?: string;
  result?: RawBlockscoutLog[] | string;
}

export interface BlockscoutClientOptions {
  baseUrl: string;
  cooldownMs: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const parseBlockscoutNumber = (value: string | number | undefined): number => {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return value.startsWith("0x")
    ? Number.parseInt(value, 16)
    : Number.parseInt(value, 10);
};

const isHex = (value: string | undefined): value is Hex =>
  typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value);

export class BlockscoutClient {
  private readonly baseUrl: string;
  private readonly cooldownMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: BlockscoutClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.cooldownMs = options.cooldownMs;
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl =
      options.fetchImpl ??
      (typeof globalThis.fetch === "function"
        ? globalThis.fetch.bind(globalThis)
        : (() => {
            throw new Error("Fetch API is not available.");
          }));
  }

  async getLogs(params: {
    fromBlock: number;
    toBlock: number;
    topic0: Hex;
  }): Promise<BlockscoutLog[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("module", "logs");
    url.searchParams.set("action", "getLogs");
    url.searchParams.set("fromBlock", String(params.fromBlock));
    url.searchParams.set("toBlock", String(params.toBlock));
    url.searchParams.set("topic0", params.topic0);

    const payload = await this.getJson<BlockscoutLogsResponse>(url.toString());
    await sleep(this.cooldownMs);

    if (typeof payload.result === "string") {
      if (/no logs found/i.test(payload.result)) return [];
      throw new Error(`Blockscout logs request failed: ${payload.result}`);
    }

    if (!Array.isArray(payload.result)) {
      if (payload.status === "0" && /no logs found/i.test(payload.message ?? "")) {
        return [];
      }
      throw new Error(
        `Blockscout logs response missing result array: ${payload.message ?? "unknown error"}`,
      );
    }

    return payload.result.flatMap((item): BlockscoutLog[] => {
      if (
        !isHex(item.address) ||
        !isHex(item.data) ||
        !isHex(item.transactionHash) ||
        !Array.isArray(item.topics)
      ) {
        return [];
      }

      const topics = item.topics.filter(isHex);
      if (topics.length === 0) return [];

      return [
        {
          address: item.address,
          blockNumber: parseBlockscoutNumber(item.blockNumber),
          data: item.data,
          logIndex: parseBlockscoutNumber(item.logIndex),
          topics,
          transactionHash: item.transactionHash,
        },
      ];
    });
  }

  private async getJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
        },
        signal: controller.signal,
      });

      if (response.status === 429) {
        await sleep(Math.max(this.cooldownMs * 4, 2_000));
      }

      if (!response.ok) {
        throw new Error(
          `Blockscout request failed: HTTP ${response.status} ${response.statusText}`,
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
