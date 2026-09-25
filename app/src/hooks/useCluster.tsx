import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { DEVNET_RPC, DEVNET_USDC_MINT } from "../lib/anchorClient";

const LIVE_UNAVAILABLE = "Live not available- Coming Soon";

type ClusterContextValue = {
  label: string;
  rpc: string;
  usdcMint: typeof DEVNET_USDC_MINT;
  notice: string;
  requestMainnet: () => void;
  dismissNotice: () => void;
};

const ClusterContext = createContext<ClusterContextValue | null>(null);

/** Devnet stays selected. Choosing mainnet only raises the coming-soon notice. */
export function ClusterProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState("");
  const value = useMemo<ClusterContextValue>(
    () => ({
      label: "Solana devnet",
      rpc: DEVNET_RPC,
      usdcMint: DEVNET_USDC_MINT,
      notice,
      requestMainnet: () => setNotice(LIVE_UNAVAILABLE),
      dismissNotice: () => setNotice(""),
    }),
    [notice]
  );
  return <ClusterContext.Provider value={value}>{children}</ClusterContext.Provider>;
}

export function useCluster(): ClusterContextValue {
  const value = useContext(ClusterContext);
  if (!value) throw new Error("useCluster must be used inside ClusterProvider");
  return value;
}
