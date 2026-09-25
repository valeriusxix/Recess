/** `VITE_SOLANA_CLUSTER=mainnet-beta` selects mainnet. Anything else stays on devnet. */
export type SolanaCluster = "devnet" | "mainnet-beta";

export function clusterName(): SolanaCluster {
  const raw = import.meta.env.VITE_SOLANA_CLUSTER ?? "";
  if (raw === "mainnet" || raw === "mainnet-beta") return "mainnet-beta";
  return "devnet";
}

export function clusterLabel(): string {
  return clusterName() === "mainnet-beta" ? "Solana mainnet" : "Solana devnet";
}

export function pythApiKey(): string {
  return (import.meta.env.VITE_PYTH_API_KEY ?? "").trim();
}
