import { describe, expect, it } from "vitest";
import { buildApprovalStateKey } from "./repository";
import type { ApprovalState } from "./types";

const baseApproval: ApprovalState = {
  chainId: 31612,
  standard: "erc20",
  tokenAddress: "0x0000000000000000000000000000000000000001",
  ownerAddress: "0x0000000000000000000000000000000000000002",
  spenderAddress: "0x0000000000000000000000000000000000000003",
  tokenId: null,
  approvedValue: 1n,
  approvedBool: null,
  lastBlockNumber: 1,
  lastLogIndex: 0,
  lastTxHash: "0x01",
};

describe("buildApprovalStateKey", () => {
  it("keeps ERC-20 approvals scoped by spender", () => {
    const first = buildApprovalStateKey(baseApproval);
    const second = buildApprovalStateKey({
      ...baseApproval,
      spenderAddress: "0x0000000000000000000000000000000000000004",
    });

    expect(first).not.toBe(second);
  });

  it("keeps ERC-721 token approvals scoped by token id, not spender", () => {
    const first = buildApprovalStateKey({
      ...baseApproval,
      standard: "erc721",
      tokenId: 42n,
      approvedValue: null,
      approvedBool: true,
    });
    const second = buildApprovalStateKey({
      ...baseApproval,
      standard: "erc721",
      spenderAddress: "0x0000000000000000000000000000000000000004",
      tokenId: 42n,
      approvedValue: null,
      approvedBool: true,
    });

    expect(first).toBe(second);
  });
});
