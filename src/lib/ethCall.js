import { hexToBytes, keccak256 } from "viem";
import { POOL_IMMUTABLE_SPANS, POOL_RUNTIME_HASH } from "./poolCode";

const ENDPOINTS = [
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.binance.org",
];
const LOGS_ENDPOINT = "https://bsc-rpc.publicnode.com";

const checkedCode = new Set();

export async function rpcRequest(url, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });
  if (!response.ok) throw new Error("The BNB Smart Chain read did not respond.");
  const body = await response.json();
  if (body.error) {
    const message = String(body.error.message || "The pool read failed.");
    throw new Error(message.length < 180 ? message : "The pool read failed.");
  }
  return body.result;
}

export async function latestBlockNumber() {
  return BigInt(await rpcRequest(ENDPOINTS[0], "eth_blockNumber", []));
}

export async function getLogs(filter) {
  return rpcRequest(LOGS_ENDPOINT, "eth_getLogs", [filter]);
}

const blockTimestampCache = new Map();

export async function blockTimestamp(blockNumber) {
  const number = BigInt(blockNumber);
  if (blockTimestampCache.has(number)) return blockTimestampCache.get(number);
  const block = await rpcRequest(ENDPOINTS[0], "eth_getBlockByNumber", [
    `0x${number.toString(16)}`,
    false,
  ]);
  if (!block?.timestamp) throw new Error("The activity timestamp could not be read.");
  const timestamp = Number(BigInt(block.timestamp));
  blockTimestampCache.set(number, timestamp);
  return timestamp;
}

function requireCallData(result) {
  if (!result || result === "0x") {
    throw new Error("The pool address did not return data. Check that VITE_RECESS_POOL is the deployed contract.");
  }
  return result;
}

async function readCall(to, data) {
  return rpcRequest(ENDPOINTS[0], "eth_call", [{ to, data }, "latest"]);
}

export async function ethCall(to, data) {
  const primary = requireCallData(await readCall(to, data));
  let secondary;
  try {
    secondary = await rpcRequest(ENDPOINTS[1], "eth_call", [{ to, data }, "latest"]);
  } catch {
    return primary;
  }
  if (!secondary || secondary === primary) return primary;

  await new Promise((resolve) => {
    setTimeout(resolve, 800);
  });
  const again = requireCallData(await readCall(to, data));
  let secondAgain;
  try {
    secondAgain = await rpcRequest(ENDPOINTS[1], "eth_call", [{ to, data }, "latest"]);
  } catch {
    return again;
  }
  if (secondAgain && secondAgain !== again) {
    throw new Error("Two BNB Smart Chain endpoints disagreed. Nothing was shown from a single answer.");
  }
  return again;
}

function normalizedCodeHash(code) {
  const bytes = hexToBytes(code);
  for (const [start, length] of POOL_IMMUTABLE_SPANS) {
    if (start + length > bytes.length) return "";
    bytes.fill(0, start, start + length);
  }
  return keccak256(bytes);
}

export async function assertRecessCode(address) {
  const key = String(address || "").toLowerCase();
  if (checkedCode.has(key)) return;
  const code = await rpcRequest(ENDPOINTS[0], "eth_getCode", [address, "latest"]);
  if (!code || code === "0x") {
    throw new Error("The pool address has no contract code. Check VITE_RECESS_POOL.");
  }
  if (normalizedCodeHash(code) !== POOL_RUNTIME_HASH) {
    throw new Error("This address is not the Recess pool this app was built for. Nothing was shown.");
  }
  checkedCode.add(key);
}

export async function waitForReceipt(hash) {
  const started = Date.now();
  while (Date.now() - started < 45_000) {
    const receipt = await rpcRequest(ENDPOINTS[0], "eth_getTransactionReceipt", [hash]);
    if (receipt) {
      if (receipt.status === "0x0") {
        throw new Error("The approval transaction failed. Nothing else was sent.");
      }
      return receipt;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }
  throw new Error("The approval is still pending. Nothing else was sent.");
}
