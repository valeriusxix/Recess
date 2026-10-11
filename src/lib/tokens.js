export const BSC_CHAIN_ID = 56;

export const TOKENS = {
  usdt: {
    symbol: "USDT",
    address: "0x55d398326f99059fF775485246999027B3197955",
    decimals: 18,
    role: "Premiums and payouts",
  },
  usdc: {
    symbol: "USDC",
    address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    decimals: 18,
    role: "Premiums and payouts in the USDC pool",
  },
  tslab: {
    symbol: "TSLAB",
    address: "0x5b1910eAaD6450E50f816082Aa078C41F10C292f",
    decimals: 18,
    role: "The stock this cover follows",
  },
  tslaon: {
    symbol: "TSLAon",
    address: "0x2494b603319d4D9F9715c9f4496d9E0364B59d93",
    decimals: 18,
    role: "Shown on the gap monitor only",
  },
  tslax: {
    symbol: "TSLAx",
    address: "0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0",
    decimals: 18,
    role: "Shown on the gap monitor only",
  },
};

export const poolAddress = String(import.meta.env.VITE_RECESS_POOL || "").trim();

export const poolConfigured = /^0x[a-fA-F0-9]{40}$/.test(poolAddress);
