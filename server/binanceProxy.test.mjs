import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrehash,
  buildRequestPath,
  collectQuotes,
  collectSimulation,
  isSignatureError,
  missingQuotes,
  missingSimulation,
  parseMarketPrice,
  parseRwaPrices,
  parseSimulation,
  parseStatusInfo,
  signPrehash,
} from "./binanceProxy.mjs";

const TSLAB = "0x5b1910eAaD6450E50f816082Aa078C41F10C292f";
const TSLAON = "0x2494b603319d4D9F9715c9f4496d9E0364B59d93";
const TSLAX = "0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0";

test("prehash is timestamp, upper method, path, and body", () => {
  const requestPath = buildRequestPath("/api/v1/dex/market/rwa/price", {
    binanceChainId: "56",
    tokenContractAddresses: `${TSLAB},${TSLAON}`,
  });
  assert.match(requestPath, /tokenContractAddresses=0x5b1910eAaD6450E50f816082Aa078C41F10C292f%2C0x2494/);
  const raw = buildRequestPath("/api/v1/dex/market/rwa/price", {
    binanceChainId: "56",
    tokenContractAddresses: `${TSLAB},${TSLAON}`,
  }, true);
  assert.match(raw, /tokenContractAddresses=0x5b1910eAaD6450E50f816082Aa078C41F10C292f,0x2494/);

  const prehash = buildPrehash({
    timestamp: "2026-05-11T10:08:57.715Z",
    method: "get",
    requestPath,
    body: "",
  });
  assert.equal(
    prehash,
    `2026-05-11T10:08:57.715ZGET${requestPath}`,
  );
  const signature = signPrehash("secret", prehash);
  assert.match(signature, /^[A-Za-z0-9+/]+=*$/);
  assert.equal(signature, signPrehash("secret", prehash));
});

test("missing keys leave prices blank", async () => {
  const quotes = missingQuotes();
  assert.equal(quotes.error, "MISSING_BINANCE_WEB3_KEYS");
  assert.equal(quotes.prices, null);
  assert.equal(quotes.statusInfo, null);

  const skipped = await collectQuotes({ apiKey: "", secret: "" });
  assert.equal(skipped.error, "MISSING_BINANCE_WEB3_KEYS");
  assert.equal(skipped.prices, null);

  const simulation = missingSimulation();
  assert.equal(simulation.skipped, true);
  assert.equal(simulation.ok, false);
  const liveSkip = await collectSimulation({ apiKey: "", secret: "", tx: {} });
  assert.equal(liveSkip.error, "MISSING_BINANCE_WEB3_KEYS");
});

test("a missing documented price field fails closed", () => {
  const parsed = parseRwaPrices({
    code: 0,
    data: [{ tokenContractAddress: TSLAB, tokenPrice: "1.00" }],
  });
  assert.equal(parsed.error, "MISSING_FIELD");
  assert.equal(parsed.prices, null);
});

test("market and session parsers keep documented fields only", () => {
  assert.equal(parseMarketPrice({ code: 0, data: [{ tokenContractAddress: TSLAB }] }, TSLAB).error, "MISSING_FIELD");
  const status = parseStatusInfo({
    code: 0,
    data: { statusInfo: { openState: false, marketStatus: "closed", reasonCode: "MARKET_CLOSED", extra: 1 } },
  });
  assert.equal(status.error, null);
  assert.equal(status.statusInfo.extra, 1);
  assert.equal(parseStatusInfo({ code: 0, data: {} }).error, "MISSING_FIELD");
});

test("a failed simulation blocks and a success does not", () => {
  const failed = parseSimulation({ code: 0, data: { status: "FAILED", failReason: "execution reverted" } });
  assert.equal(failed.ok, false);
  assert.equal(failed.skipped, false);
  assert.match(failed.message, /execution reverted/);

  const ok = parseSimulation({ code: 0, data: { status: "SUCCESS", failReason: null } });
  assert.equal(ok.ok, true);
});

test("only an HTTP 401 that mentions a signature is retried", () => {
  assert.equal(isSignatureError({ httpStatus: 401, json: { msg: "invalid signature" } }), true);
  assert.equal(isSignatureError({ httpStatus: 403, json: { msg: "invalid signature" } }), false);
  assert.equal(isSignatureError({ httpStatus: 401, json: { msg: "missing key" } }), false);
  assert.equal(isSignatureError({ httpStatus: 200, json: { msg: "invalid signature" } }), false);
});

test("a signature error retries the price call once with a raw comma", async () => {
  const calls = [];
  const quotes = await collectQuotes({
    apiKey: "key",
    secret: "secret",
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init.method, rawComma: url.includes(`${TSLAB},`) });
      if (calls.length === 1) {
        return { status: 401, async text() { return JSON.stringify({ code: 1, msg: "invalid signature", data: null }); } };
      }
      if (url.includes("/rwa/price")) {
        return {
          status: 200,
          async text() {
            return JSON.stringify({
              code: 0,
              data: [TSLAB, TSLAON, TSLAX].map((address) => ({
                tokenContractAddress: address,
                tokenPrice: "10.00",
                referencePrice: "10.10",
              })),
            });
          },
        };
      }
      if (url.includes("underlying-market")) {
        return {
          status: 200,
          async text() {
            return JSON.stringify({
              code: 0,
              data: { statusInfo: { openState: false, marketStatus: "closed", reasonCode: null } },
            });
          },
        };
      }
      const requested = JSON.parse(init.body).tokenContractAddress;
      return {
        status: 200,
        async text() {
          return JSON.stringify({ code: 0, data: [{ tokenContractAddress: requested, price: "10.50" }] });
        },
      };
    },
    now: () => new Date("2026-05-11T10:08:57.715Z"),
  });

  assert.equal(quotes.error, null);
  assert.equal(quotes.prices.tslab.tokenPrice, "10.00");
  assert.equal(quotes.prices.tslab.marketPrice, "10.50");
  assert.equal(quotes.statusInfo.marketStatus, "closed");
  assert.equal(quotes.attempts.length, 6);
  assert.equal(quotes.attempts[0].rawComma, false);
  assert.equal(quotes.attempts[1].rawComma, true);
  assert.equal(isSignatureError({ httpStatus: 401, json: { msg: "invalid signature" } }), true);
});
