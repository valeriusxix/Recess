import assert from "node:assert/strict";
import test from "node:test";
import { simulateWrite } from "./simulate.js";

const tx = {
  from: "0x29987C5b4DDe0e33C926CbB5F95f77777C84B06E",
  to: "0x55d398326f99059fF775485246999027B3197955",
  data: "0x095ea7b3",
  value: "0x0",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("a skipped Binance simulation still allows the wallet send", async () => {
  const result = await simulateWrite(tx, {
    fetchApi: async () => jsonResponse({
      ok: false,
      skipped: true,
      warning: "keys missing",
    }),
    fetchRpc: async () => {
      throw new Error("rpc should not be called");
    },
  });
  assert.equal(result.blocked, false);
  assert.equal(result.warning, "keys missing");
});

test("a Binance rejection still blocks the send", async () => {
  const result = await simulateWrite(tx, {
    fetchApi: async () => jsonResponse({
      ok: false,
      skipped: false,
      message: "Simulation status was FAILED. Nothing was sent.",
    }),
    fetchRpc: async () => {
      throw new Error("rpc should not be called");
    },
  });
  assert.equal(result.blocked, true);
  assert.match(result.message, /FAILED/);
});

test("an HTML response from a static host uses a successful chain dry-run", async () => {
  const result = await simulateWrite(tx, {
    fetchApi: async () => new Response("<html>not found</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
    fetchRpc: async () => jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x" }),
  });
  assert.equal(result.blocked, false);
  assert.match(result.warning, /dry-run succeeded/);
});

test("an HTML response still blocks when the chain dry-run reverts", async () => {
  const result = await simulateWrite(tx, {
    fetchApi: async () => new Response("nope", { status: 404 }),
    fetchRpc: async () => jsonResponse({
      jsonrpc: "2.0",
      id: 1,
      error: { message: "execution reverted: 0x90b8ec18" },
    }),
  });
  assert.equal(result.blocked, true);
  assert.match(result.message, /USDT transfer failed/);
  assert.match(result.message, /Nothing was sent/);
});

test("nothing is sent when both the simulator and the chain dry-run are down", async () => {
  const result = await simulateWrite(tx, {
    fetchApi: async () => {
      throw new Error("offline");
    },
    fetchRpc: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(result.blocked, true);
  assert.match(result.message, /did not respond/);
});
