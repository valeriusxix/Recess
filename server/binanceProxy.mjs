import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BINANCE_HOST = "https://web3.binance.com";
export const BSC_CHAIN_ID = "56";

export const TOKENS = {
  tslab: "0x5b1910eAaD6450E50f816082Aa078C41F10C292f",
  tslaon: "0x2494b603319d4D9F9715c9f4496d9E0364B59d93",
  tslax: "0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0",
};

const MARKET_STATUSES = new Set(["premarket", "regular", "postmarket", "overnight", "closed", "pause"]);

export function loadRootEnv(root = process.cwd()) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(root, ".env"),
    path.join(here, "..", ".env"),
  ];
  for (const file of candidates) {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
    }
    return;
  }
}

export function credentialsFromEnv() {
  const apiKey = String(process.env.BINANCE_WEB3_API_KEY || "").trim();
  const secret = String(process.env.BINANCE_WEB3_SECRET_KEY || "").trim();
  return { apiKey, secret, configured: Boolean(apiKey && secret) };
}

export function buildRequestPath(pathname, params, rawComma = false) {
  const query = Object.entries(params).map(([key, value]) => {
    const encodedValue = rawComma ? String(value) : encodeURIComponent(String(value));
    return `${encodeURIComponent(key)}=${encodedValue}`;
  }).join("&");
  return `/build${pathname}${query ? `?${query}` : ""}`;
}

export function buildPrehash({ timestamp, method, requestPath, body = "" }) {
  return `${timestamp}${String(method).toUpperCase()}${requestPath}${body}`;
}

export function signPrehash(secret, prehash) {
  return crypto.createHmac("sha256", secret).update(prehash).digest("base64");
}

export function missingQuotes() {
  return {
    error: "MISSING_BINANCE_WEB3_KEYS",
    warning: "BINANCE_WEB3_API_KEY and BINANCE_WEB3_SECRET_KEY are not set, so no price is shown.",
    prices: null,
    statusInfo: null,
    attempts: [],
  };
}

export function missingSimulation() {
  return {
    ok: false,
    skipped: true,
    error: "MISSING_BINANCE_WEB3_KEYS",
    warning: "Binance simulation was skipped because BINANCE_WEB3_API_KEY and BINANCE_WEB3_SECRET_KEY are not set. You can still send this transaction from the wallet.",
  };
}

export function isSignatureError(result) {
  if (!result || result.httpStatus !== 401) return false;
  const msg = `${result.json?.msg || ""} ${result.json?.message || ""}`;
  return /sign/i.test(msg);
}

function fail(error, detail) {
  return {
    error,
    detail,
    warning: null,
    prices: null,
    statusInfo: null,
  };
}

function envelopeData(json) {
  if (!json || typeof json !== "object" || !("code" in json) || !("data" in json)) {
    return { ok: false, detail: "The response was missing code or data." };
  }
  if (json.code !== 0 && json.code !== "0") {
    return { ok: false, detail: `code ${json.code}: ${String(json.msg || "request failed")}`.slice(0, 300) };
  }
  return { ok: true, data: json.data };
}

export function parseRwaPrices(json) {
  const envelope = envelopeData(json);
  if (!envelope.ok) return fail("BINANCE_ERROR", envelope.detail);
  if (!Array.isArray(envelope.data)) return fail("MISSING_FIELD", "RWA price data was not a list.");

  const byAddress = new Map();
  for (const row of envelope.data) {
    if (!row || typeof row.tokenContractAddress !== "string") {
      return fail("MISSING_FIELD", "An RWA price row was missing tokenContractAddress.");
    }
    if (typeof row.tokenPrice !== "string" || row.tokenPrice === "") {
      return fail("MISSING_FIELD", "An RWA price row was missing tokenPrice.");
    }
    if (typeof row.referencePrice !== "string" || row.referencePrice === "") {
      return fail("MISSING_FIELD", "An RWA price row was missing referencePrice.");
    }
    byAddress.set(row.tokenContractAddress.toLowerCase(), row);
  }

  const prices = {};
  for (const [symbol, address] of Object.entries(TOKENS)) {
    const row = byAddress.get(address.toLowerCase());
    if (!row) return fail("MISSING_FIELD", `The RWA price list had no row for ${symbol}.`);
    prices[symbol] = {
      tokenPrice: row.tokenPrice,
      referencePrice: row.referencePrice,
      marketPrice: null,
    };
  }
  return { error: null, prices };
}

export function parseMarketPrice(json, address) {
  const envelope = envelopeData(json);
  if (!envelope.ok) return { error: "BINANCE_ERROR", detail: envelope.detail };
  if (!Array.isArray(envelope.data) || envelope.data.length === 0) {
    return { error: "MISSING_FIELD", detail: "Market price data was empty." };
  }
  const row = envelope.data.find((item) => item?.tokenContractAddress?.toLowerCase() === address.toLowerCase())
    || envelope.data[0];
  if (!row || typeof row.price !== "string" || row.price === "") {
    return { error: "MISSING_FIELD", detail: "A market price row was missing price." };
  }
  return { error: null, price: row.price };
}

export function parseStatusInfo(json) {
  const envelope = envelopeData(json);
  if (!envelope.ok) return { error: "BINANCE_ERROR", detail: envelope.detail };
  const statusInfo = envelope.data?.statusInfo;
  if (!statusInfo || typeof statusInfo !== "object" || Array.isArray(statusInfo)) {
    return { error: "MISSING_FIELD", detail: "Underlying market data was missing statusInfo." };
  }
  if (typeof statusInfo.openState !== "boolean") {
    return { error: "MISSING_FIELD", detail: "statusInfo.openState was missing." };
  }
  if (typeof statusInfo.marketStatus !== "string" || !MARKET_STATUSES.has(statusInfo.marketStatus)) {
    return { error: "MISSING_FIELD", detail: "statusInfo.marketStatus was missing." };
  }
  if (!("reasonCode" in statusInfo)) {
    return { error: "MISSING_FIELD", detail: "statusInfo.reasonCode was missing." };
  }
  return { error: null, statusInfo };
}

export function parseSimulation(json) {
  const envelope = envelopeData(json);
  if (!envelope.ok) {
    return {
      ok: false,
      skipped: false,
      error: "SIMULATION_REJECTED",
      message: envelope.detail || "Simulation rejected this transaction. Nothing was sent.",
    };
  }
  const status = envelope.data?.status;
  if (typeof status !== "string" || status === "") {
    return {
      ok: false,
      skipped: false,
      error: "MISSING_FIELD",
      message: "Simulation did not return a status. Nothing was sent.",
    };
  }
  if (status !== "SUCCESS") {
    const reason = typeof envelope.data?.failReason === "string" && envelope.data.failReason
      ? envelope.data.failReason
      : `Simulation status was ${status}.`;
    return {
      ok: false,
      skipped: false,
      error: "SIMULATION_REJECTED",
      message: `${reason} Nothing was sent.`.slice(0, 400),
    };
  }
  return { ok: true, skipped: false, error: null, warning: null, status };
}

function summarizeAttempt(pathname, rawComma, result) {
  return {
    path: pathname,
    rawComma,
    httpStatus: result?.httpStatus || 0,
    code: result?.json?.code ?? null,
    msg: String(result?.json?.msg || result?.error || "").slice(0, 200),
  };
}

async function signedRequest({
  apiKey,
  secret,
  method,
  pathname,
  params = null,
  body = null,
  rawComma = false,
  fetchImpl,
  now,
}) {
  const timestamp = now().toISOString();
  const payload = body == null ? "" : JSON.stringify(body);
  const requestPath = params ? buildRequestPath(pathname, params, rawComma) : `/build${pathname}`;
  const prehash = buildPrehash({ timestamp, method, requestPath, body: payload });
  const headers = {
    "X-OC-APIKEY": apiKey,
    "X-OC-TIMESTAMP": timestamp,
    "X-OC-SIGN": signPrehash(secret, prehash),
    accept: "application/json",
  };
  if (payload) headers["content-type"] = "application/json";

  let response;
  try {
    response = await fetchImpl(`${BINANCE_HOST}${requestPath}`, {
      method,
      headers,
      body: payload || undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    const cause = error?.cause;
    const detail = [
      error?.name || "TypeError",
      cause?.code,
      cause?.message || error?.message,
    ].filter(Boolean).join(": ");
    return { httpStatus: 0, json: null, error: detail };
  }

  const text = await readResponseText(response);
  if (text == null) return { httpStatus: response.status, json: null, error: "response too large" };
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { httpStatus: response.status, json };
}

async function getSigned(options) {
  return signedRequest({ ...options, method: "GET", body: null });
}

export async function collectQuotes({ apiKey, secret, fetchImpl = fetch, now = () => new Date() }) {
  if (!apiKey || !secret) return missingQuotes();

  const attempts = [];
  const addresses = Object.values(TOKENS).join(",");
  const priceParams = { binanceChainId: BSC_CHAIN_ID, tokenContractAddresses: addresses };
  let rwa = await getSigned({
    apiKey, secret, pathname: "/api/v1/dex/market/rwa/price", params: priceParams, rawComma: false, fetchImpl, now,
  });
  attempts.push(summarizeAttempt("/api/v1/dex/market/rwa/price", false, rwa));
  if (isSignatureError(rwa)) {
    rwa = await getSigned({
      apiKey, secret, pathname: "/api/v1/dex/market/rwa/price", params: priceParams, rawComma: true, fetchImpl, now,
    });
    attempts.push(summarizeAttempt("/api/v1/dex/market/rwa/price", true, rwa));
  }

  const parsedRwa = rwa.json ? parseRwaPrices(rwa.json) : fail("BINANCE_ERROR", "The RWA price response was not JSON.");
  if (parsedRwa.error) return { ...parsedRwa, attempts };

  const statusResult = await getSigned({
    apiKey,
    secret,
    pathname: "/api/v1/dex/market/rwa/underlying-market",
    params: { binanceChainId: BSC_CHAIN_ID, tokenContractAddress: TOKENS.tslab },
    fetchImpl,
    now,
  });
  attempts.push(summarizeAttempt("/api/v1/dex/market/rwa/underlying-market", false, statusResult));
  const parsedStatus = statusResult.json
    ? parseStatusInfo(statusResult.json)
    : { error: "BINANCE_ERROR", detail: "The underlying market response was not JSON." };
  if (parsedStatus.error) return fail(parsedStatus.error, parsedStatus.detail);

  const prices = parsedRwa.prices;
  for (const [symbol, address] of Object.entries(TOKENS)) {
    const market = await signedRequest({
      apiKey,
      secret,
      method: "POST",
      pathname: "/api/v1/dex/market/price",
      body: { binanceChainId: BSC_CHAIN_ID, tokenContractAddress: address },
      fetchImpl,
      now,
    });
    attempts.push(summarizeAttempt("/api/v1/dex/market/price", false, market));
    const parsed = market.json
      ? parseMarketPrice(market.json, address)
      : { error: "BINANCE_ERROR", detail: "The market price response was not JSON." };
    if (parsed.error) return { ...fail(parsed.error, parsed.detail), attempts };
    prices[symbol].marketPrice = parsed.price;
  }

  return {
    error: null,
    warning: null,
    prices,
    statusInfo: parsedStatus.statusInfo,
    attempts,
  };
}

export async function collectSimulation({ apiKey, secret, tx, fetchImpl = fetch, now = () => new Date() }) {
  if (!apiKey || !secret) return missingSimulation();
  const from = String(tx?.from || "");
  const to = String(tx?.to || "");
  const data = String(tx?.data || "");
  const value = String(tx?.value || "0x0");
  if (!/^0x[a-fA-F0-9]{40}$/.test(from) || !/^0x[a-fA-F0-9]{40}$/.test(to) || !/^0x[a-fA-F0-9]*$/.test(data)) {
    return {
      ok: false,
      skipped: false,
      error: "BAD_REQUEST",
      message: "Simulation needs a from address, a to address, and hex calldata. Nothing was sent.",
    };
  }

  const result = await signedRequest({
    apiKey,
    secret,
    method: "POST",
    pathname: "/api/v1/dex/pre-transaction/simulate",
    body: { binanceChainId: BSC_CHAIN_ID, evmTx: { from, to, value, data } },
    fetchImpl,
    now,
  });
  if (!result.json) {
    return {
      ok: false,
      skipped: false,
      error: "SIMULATION_REJECTED",
      message: "Simulation did not return JSON. Nothing was sent.",
    };
  }
  return parseSimulation(result.json);
}

function publicQuotes(result) {
  return {
    error: result.error,
    detail: result.detail || null,
    warning: result.warning || null,
    prices: result.prices,
    statusInfo: result.statusInfo,
  };
}

const MAX_RESPONSE_CHARS = 1_000_000;
const recentCalls = new Map();

async function readResponseText(response) {
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_CHARS) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  }
  const text = await response.text();
  return text.length > MAX_RESPONSE_CHARS ? null : text;
}

function rateLimited(req, bucket, limit) {
  const ip = req.socket?.remoteAddress || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const stamps = (recentCalls.get(key) || []).filter((stamp) => now - stamp < 60_000);
  if (stamps.length >= limit) {
    recentCalls.set(key, stamps);
    return true;
  }
  stamps.push(now);
  recentCalls.set(key, stamps);
  return false;
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 100_000) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function handleRecessApi(req, res) {
  loadRootEnv();
  const url = new URL(req.url || "/", "http://recess.local");
  const creds = credentialsFromEnv();

  if (req.method === "GET" && url.pathname === "/api/recess/quotes") {
    if (rateLimited(req, "quotes", 60)) {
      sendJson(res, 429, {
        error: "RATE_LIMITED",
        prices: null,
        statusInfo: null,
        message: "Too many price requests from this address. Wait a minute and try again.",
      });
      return;
    }
    const quotes = await collectQuotes(creds);
    sendJson(res, 200, publicQuotes(quotes));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/recess/simulate") {
    if (rateLimited(req, "simulate", 20)) {
      sendJson(res, 429, {
        ok: false,
        skipped: false,
        error: "RATE_LIMITED",
        message: "Too many simulation requests from this address. Wait a minute and try again.",
      });
      return;
    }
    let tx = {};
    try {
      const raw = await readBody(req);
      tx = raw ? JSON.parse(raw) : {};
    } catch {
      sendJson(res, 400, {
        ok: false,
        skipped: false,
        error: "BAD_REQUEST",
        message: "The simulation body was not JSON. Nothing was sent.",
      });
      return;
    }
    const result = await collectSimulation({ ...creds, tx });
    sendJson(res, 200, result);
    return;
  }

  sendJson(res, 404, { error: "NOT_FOUND" });
}

export function recessProxyPlugin() {
  const attach = (middlewares) => {
    middlewares.use((req, res, next) => {
      const url = req.url || "";
      if (!url.startsWith("/api/recess/")) {
        next();
        return;
      }
      handleRecessApi(req, res).catch(() => {
        if (!res.headersSent) {
          sendJson(res, 500, {
            error: "PROXY_FAILED",
            prices: null,
            statusInfo: null,
            message: "The price proxy failed before it finished the request.",
          });
        }
      });
    });
  };
  return {
    name: "recess-binance-proxy",
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return path.resolve(entry) === fileURLToPath(import.meta.url);
}

async function main() {
  loadRootEnv();
  if (process.argv.includes("--probe")) {
    const started = Date.now();
    const creds = credentialsFromEnv();
    const quotes = await collectQuotes(creds);
    const report = {
      keysConfigured: creds.configured,
      error: quotes.error,
      detail: quotes.detail || null,
      elapsedMs: Date.now() - started,
      attempts: quotes.attempts || [],
      hasPrices: Boolean(quotes.prices),
      hasStatusInfo: Boolean(quotes.statusInfo),
    };
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return;
  }

  const port = Number(process.env.RECESS_API_PORT || 8787);
  const server = http.createServer((req, res) => {
    handleRecessApi(req, res).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: "PROXY_FAILED" });
    });
  });
  server.listen(port, "127.0.0.1");
}

if (isMainModule()) {
  main().catch(() => {
    process.stdout.write("{\"error\":\"PROXY_FAILED\"}\n");
    process.exitCode = 1;
  });
}
