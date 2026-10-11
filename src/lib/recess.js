import { decodeEventLog, decodeFunctionResult, encodeFunctionData, toEventSelector } from "viem";
import { assertRecessCode, ethCall, getLogs, waitForReceipt } from "./ethCall";
import { erc20Abi, recessAbi } from "./recessAbi";
import { TOKENS } from "./tokens";

const USDT = TOKENS.usdt.address;
const EVENT_GROUPS = [
  {
    topicIndex: 1,
    events: [
      { abi: recessAbi[0], type: "deposit", topic: toEventSelector(recessAbi[0]) },
      { abi: recessAbi[1], type: "withdrawal", topic: toEventSelector(recessAbi[1]) },
    ],
  },
  {
    topicIndex: 2,
    events: [
      { abi: recessAbi[2], type: "position-opened", topic: toEventSelector(recessAbi[2]) },
      { abi: recessAbi[3], type: "payout", topic: toEventSelector(recessAbi[3]) },
    ],
  },
];

export function encodePool(functionName, args) {
  return encodeFunctionData({ abi: recessAbi, functionName, args });
}

export function encodeApprove(spender, amount) {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
  });
}

async function read(abi, address, functionName, args = []) {
  const data = encodeFunctionData({ abi, functionName, args });
  const result = await ethCall(address, data);
  return decodeFunctionResult({ abi, functionName, data: result });
}

export async function fetchPoolState(poolAddress) {
  await assertRecessCode(poolAddress);
  const [pool, paused, accountedAssets] = await Promise.all([
    read(recessAbi, poolAddress, "viewPool"),
    read(recessAbi, poolAddress, "paused"),
    read(recessAbi, poolAddress, "accountedAssets"),
  ]);
  const vault = await read(erc20Abi, pool.usdt, "balanceOf", [poolAddress]);
  return {
    pool: { ...pool, paused: Boolean(paused), accountedAssets },
    vault,
  };
}

export async function fetchShares(poolAddress, account) {
  return read(recessAbi, poolAddress, "sharesOf", [account]);
}

export async function fetchPolicies(poolAddress, owner) {
  const ids = await read(recessAbi, poolAddress, "policyIdsOf", [owner]);
  const policies = [];
  for (const id of ids) {
    const policy = await read(recessAbi, poolAddress, "getPolicy", [id]);
    policies.push({
      id,
      owner: policy.owner,
      notional: policy.notional,
      thresholdBps: Number(policy.thresholdBps),
      premiumPaid: policy.premiumPaid,
      referencePrice: policy.referencePrice,
      coverageStartTs: policy.coverageStartTs,
      coverageEndTs: policy.coverageEndTs,
      status: Number(policy.status),
      payoutAmount: policy.payoutAmount,
      settledWithDemoPrices: Boolean(policy.settledWithDemoPrices),
    });
  }
  return policies;
}

export async function fetchAccountActivity(poolAddress, account, fromBlock, toBlock) {
  const from = BigInt(fromBlock);
  const to = BigInt(toBlock);
  if (from > to) return [];

  const ownerTopic = `0x${account.slice(2).toLowerCase().padStart(64, "0")}`;
  const eventByTopic = new Map(EVENT_GROUPS.flatMap(({ events }) =>
    events.map((event) => [event.topic.toLowerCase(), event])));
  const activity = [];
  const rangeSize = 10_000n;

  for (let start = from; start <= to; start += rangeSize) {
    const end = start + rangeSize - 1n < to ? start + rangeSize - 1n : to;
    const results = await Promise.all(EVENT_GROUPS.map(({ events, topicIndex }) => {
      const topics = topicIndex === 1
        ? [events.map((event) => event.topic), ownerTopic]
        : [events.map((event) => event.topic), null, ownerTopic];
      return getLogs({
        address: poolAddress,
        fromBlock: `0x${start.toString(16)}`,
        toBlock: `0x${end.toString(16)}`,
        topics,
      });
    }));

    for (const log of results.flat()) {
      const event = eventByTopic.get(log.topics[0]?.toLowerCase());
      if (!event) continue;
      const { args } = decodeEventLog({ abi: [event.abi], data: log.data, topics: log.topics });
      const common = {
        id: `${log.transactionHash}:${Number(BigInt(log.logIndex))}`,
        type: event.type,
        blockNumber: BigInt(log.blockNumber),
        logIndex: Number(BigInt(log.logIndex)),
        transactionHash: log.transactionHash,
      };

      if (event.type === "deposit") {
        activity.push({ ...common, amount: args.amount, shares: args.shares });
      } else if (event.type === "withdrawal") {
        activity.push({ ...common, amount: args.amount, shares: args.shares });
      } else if (event.type === "position-opened") {
        activity.push({
          ...common,
          policyId: args.policyId,
          notional: args.notional,
          thresholdBps: Number(args.thresholdBps),
          amount: args.premium,
        });
      } else {
        activity.push({ ...common, policyId: args.policyId, amount: args.payout });
      }
    }
  }

  return activity.sort((left, right) => (
    left.blockNumber === right.blockNumber
      ? left.logIndex - right.logIndex
      : left.blockNumber < right.blockNumber ? -1 : 1
  ));
}

export function accountActivityStartBlock() {
  const configured = String(import.meta.env.VITE_RECESS_POOL_START_BLOCK || "127017054").trim();
  if (!/^\d+$/.test(configured)) {
    throw new Error("VITE_RECESS_POOL_START_BLOCK must be a non-negative block number.");
  }
  return BigInt(configured);
}

export async function readAllowance(token, owner, spender) {
  return read(erc20Abi, token, "allowance", [owner, spender]);
}

export async function approveUsdtIfNeeded({ token = USDT, owner, spender, amount, send }) {
  const current = await readAllowance(token, owner, spender);
  const hashes = [];
  const warnings = [];
  if (current >= amount) return { ok: true, hashes, warnings };

  try {
    if (current > 0n) {
      const reset = await send({ to: token, data: encodeApprove(spender, 0n) });
      if (!reset) return { ok: false, hashes, warnings };
      hashes.push(reset.hash);
      if (reset.warning) warnings.push(reset.warning);
      await waitForReceipt(reset.hash);
    }

    const next = await send({ to: token, data: encodeApprove(spender, amount) });
    if (!next) return { ok: false, hashes, warnings };
    hashes.push(next.hash);
    if (next.warning) warnings.push(next.warning);
    await waitForReceipt(next.hash);
  } catch (error) {
    return {
      ok: false,
      hashes,
      warnings,
      error: error instanceof Error ? error.message : "The approval did not finish. Nothing else was sent.",
    };
  }
  return { ok: true, hashes, warnings };
}

export function txUrl(hash) {
  return `https://bscscan.com/tx/${hash}`;
}
