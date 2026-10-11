import { TOKENS } from "./tokens";

function readAddress(value) {
  const address = String(value || "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address : "";
}

export const SETTLEMENTS = [
  {
    id: "usdt",
    symbol: "USDT",
    tokenAddress: TOKENS.usdt.address,
    poolAddress: readAddress(import.meta.env.VITE_RECESS_POOL),
    envName: "VITE_RECESS_POOL",
  },
  {
    id: "usdc",
    symbol: "USDC",
    tokenAddress: TOKENS.usdc.address,
    poolAddress: readAddress(import.meta.env.VITE_RECESS_POOL_USDC),
    envName: "VITE_RECESS_POOL_USDC",
  },
];

export function settlementById(id) {
  return SETTLEMENTS.find((item) => item.id === id) || SETTLEMENTS[0];
}
