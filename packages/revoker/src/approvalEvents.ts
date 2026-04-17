import {
  decodeEventLog,
  getAddress,
  parseAbiItem,
  toEventHash,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import type { BlockscoutLog } from "./blockscoutClient";
import type { ApprovalStandard, ApprovalState } from "./types";

export const ERC20_OR_ERC721_APPROVAL_EVENT = parseAbiItem(
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
);

export const APPROVAL_FOR_ALL_EVENT = parseAbiItem(
  "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
);

export const APPROVAL_TOPIC = toEventHash(ERC20_OR_ERC721_APPROVAL_EVENT);
export const APPROVAL_FOR_ALL_TOPIC = toEventHash(APPROVAL_FOR_ALL_EVENT);

const ERC721_INTERFACE_ID = "0x80ac58cd";
const ERC1155_INTERFACE_ID = "0xd9b67a26";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type TokenStandardCache = Map<string, ApprovalStandard>;

interface ApprovalEvent {
  eventName?: string;
  args?: {
    owner?: Address;
    spender?: Address;
    value?: bigint;
  };
}

interface ApprovalForAllEvent {
  eventName?: string;
  args?: {
    owner?: Address;
    operator?: Address;
    approved?: boolean;
  };
}

const supportsInterfaceAbi = [
  {
    type: "function",
    name: "supportsInterface",
    stateMutability: "view",
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export class ApprovalEventParser {
  private readonly tokenStandardCache: TokenStandardCache = new Map();

  constructor(
    private readonly client: PublicClient,
    private readonly chainId: number,
  ) {}

  async parse(log: BlockscoutLog): Promise<ApprovalState | null> {
    const topic0 = log.topics[0]?.toLowerCase();

    if (topic0 === APPROVAL_TOPIC.toLowerCase()) {
      return this.parseApproval(log);
    }

    if (topic0 === APPROVAL_FOR_ALL_TOPIC.toLowerCase()) {
      return this.parseApprovalForAll(log);
    }

    return null;
  }

  private async parseApproval(log: BlockscoutLog): Promise<ApprovalState | null> {
    try {
      const decoded = decodeEventLog({
        abi: [ERC20_OR_ERC721_APPROVAL_EVENT],
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      }) as ApprovalEvent;

      if (decoded.eventName !== "Approval" || !decoded.args) return null;
      if (!decoded.args.owner || !decoded.args.spender) return null;
      if (decoded.args.value == null) return null;

      const tokenAddress = getAddress(log.address);
      const standard = await this.classifyApprovalToken(tokenAddress);
      const ownerAddress = getAddress(decoded.args.owner);
      const spenderAddress = getAddress(decoded.args.spender);
      const value = decoded.args.value;

      return {
        chainId: this.chainId,
        standard,
        tokenAddress,
        ownerAddress,
        spenderAddress,
        tokenId: standard === "erc721" ? value : null,
        approvedValue: standard === "erc721" ? null : value,
        approvedBool:
          standard === "erc721"
            ? spenderAddress.toLowerCase() !== ZERO_ADDRESS
            : null,
        lastBlockNumber: log.blockNumber,
        lastLogIndex: log.logIndex,
        lastTxHash: log.transactionHash,
      };
    } catch {
      return null;
    }
  }

  private async parseApprovalForAll(
    log: BlockscoutLog,
  ): Promise<ApprovalState | null> {
    try {
      const decoded = decodeEventLog({
        abi: [APPROVAL_FOR_ALL_EVENT],
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      }) as ApprovalForAllEvent;

      if (decoded.eventName !== "ApprovalForAll" || !decoded.args) return null;
      if (!decoded.args.owner || !decoded.args.operator) return null;
      if (decoded.args.approved == null) return null;

      const tokenAddress = getAddress(log.address);
      const standard = await this.classifyApprovalForAllToken(tokenAddress);

      return {
        chainId: this.chainId,
        standard,
        tokenAddress,
        ownerAddress: getAddress(decoded.args.owner),
        spenderAddress: getAddress(decoded.args.operator),
        tokenId: null,
        approvedValue: null,
        approvedBool: decoded.args.approved,
        lastBlockNumber: log.blockNumber,
        lastLogIndex: log.logIndex,
        lastTxHash: log.transactionHash,
      };
    } catch {
      return null;
    }
  }

  private async classifyApprovalToken(token: Address): Promise<ApprovalStandard> {
    const cached = this.tokenStandardCache.get(token.toLowerCase());
    if (cached) return cached;

    const isErc721 = await this.supportsInterface(token, ERC721_INTERFACE_ID);
    const standard: ApprovalStandard = isErc721 ? "erc721" : "erc20";
    this.tokenStandardCache.set(token.toLowerCase(), standard);
    return standard;
  }

  private async classifyApprovalForAllToken(
    token: Address,
  ): Promise<ApprovalStandard> {
    const cached = this.tokenStandardCache.get(token.toLowerCase());
    if (cached === "erc721" || cached === "erc1155") return cached;

    const [isErc1155, isErc721] = await Promise.all([
      this.supportsInterface(token, ERC1155_INTERFACE_ID),
      this.supportsInterface(token, ERC721_INTERFACE_ID),
    ]);

    const standard: ApprovalStandard = isErc1155
      ? "erc1155"
      : isErc721
        ? "erc721"
        : "unknown";
    this.tokenStandardCache.set(token.toLowerCase(), standard);
    return standard;
  }

  private async supportsInterface(
    token: Address,
    interfaceId: Hex,
  ): Promise<boolean> {
    try {
      return await this.client.readContract({
        address: token,
        abi: supportsInterfaceAbi,
        functionName: "supportsInterface",
        args: [interfaceId],
      });
    } catch {
      return false;
    }
  }
}
