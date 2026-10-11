const DRY_RUN_ENDPOINTS = [
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.binance.org",
];
const DRY_RUN_WARNING = "Binance simulation is not running on this site. A BNB Smart Chain dry-run succeeded, so the wallet can still send this.";
const REVERT_REASONS = {
  "0x90b8ec18": "The USDT transfer failed. Approve the pool for this amount and make sure the wallet holds it.",
  "0x1f2a2005": "The amount has to be greater than zero.",
  "0xfddafdf5": "The pool does not have enough USDT to back that cover.",
  "0xd917b4fe": "That withdrawal would leave the pool below cover that is still open.",
  "0x9e87fac8": "The pool is paused.",
  "0x791aad89": "The pool did not receive the full token amount.",
  "0x5419376a": "That coverage window is not valid.",
  "0xc3f6231f": "Deposits are disabled because the pool is insolvent.",
};

function readableRevert(message) {
  const selector = String(message).toLowerCase().match(/0x[a-f0-9]{8}/);
  if (!selector) return message;
  return REVERT_REASONS[selector[0]] || message;
}

async function simulateTransaction({ from, to, data, value = "0x0" }, fetchImpl) {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ from, to, data, value }, "latest"],
  });

  async function once(url) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
      });
      if (!response.ok) return { kind: "transport" };
      const body = await response.json();
      if (body.error) {
        const message = String(body.error.message || "The dry-run reverted.");
        const readable = readableRevert(message);
        return { kind: "revert", message: readable.length < 180 ? readable : "The dry-run reverted." };
      }
      if (!("result" in body)) return { kind: "transport" };
      return { kind: "ok" };
    } catch {
      return { kind: "transport" };
    }
  }

  const primary = await once(DRY_RUN_ENDPOINTS[0]);
  if (primary.kind === "revert") return { ok: false, message: primary.message };
  const secondary = await once(DRY_RUN_ENDPOINTS[1]);
  if (secondary.kind === "revert") return { ok: false, message: secondary.message };
  if (primary.kind === "ok" || secondary.kind === "ok") return { ok: true };
  return { ok: false, message: "The BNB Smart Chain dry-run did not respond." };
}

function blocked(message) {
  return { blocked: true, message };
}

async function chainDryRun(tx, fetchRpc) {
  const result = await simulateTransaction(tx, fetchRpc);
  if (!result.ok) {
    const detail = result.message || "The dry-run reverted.";
    return blocked(detail.includes("Nothing was sent") ? detail : `${detail} Nothing was sent.`);
  }
  return { blocked: false, warning: DRY_RUN_WARNING };
}

export async function simulateWrite(tx, deps = {}) {
  const fetchApi = deps.fetchApi || fetch;
  const fetchRpc = deps.fetchRpc || fetch;
  let response;
  try {
    response = await fetchApi("/api/recess/simulate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: tx.from,
        to: tx.to,
        data: tx.data,
        value: tx.value || "0x0",
      }),
    });
  } catch {
    return chainDryRun(tx, fetchRpc);
  }

  const body = await response.json().catch(() => null);
  if (!body || typeof body.ok !== "boolean") return chainDryRun(tx, fetchRpc);
  if (body.skipped) {
    return {
      blocked: false,
      warning: body.warning || "Simulation was skipped. The wallet can still send this transaction.",
    };
  }
  if (!response.ok || !body.ok) {
    return blocked(body.message || "Simulation rejected this transaction. Nothing was sent.");
  }
  return { blocked: false, warning: "" };
}
