import { useEffect, useState } from "react";
import { getAccount } from "@solana/spl-token";
import { TSLA_SYMBOL } from "../lib/pyth";
import { poolPda, readField, vaultPda } from "../lib/anchorClient";
import { toBig } from "../lib/format";
import { useProgram } from "./useProgram";

export type PoolView = {
  symbol: string;
  authority: string;
  usdcMint: string;
  demoMode: boolean;
  demoPricesSet: boolean;
  demoReferencePrice: bigint;
  demoSettlementPrice: bigint;
  totalShares: bigint;
  outstanding: bigint;
  premiums: bigint;
  vaultBalance: bigint;
};

export function usePool() {
  const { connection, program } = useProgram();
  const [pool, setPool] = useState<PoolView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const address = poolPda();
  const vault = vaultPda();
  const addressKey = address.toBase58();
  const vaultKey = vault.toBase58();

  useEffect(() => {
    if (!program) {
      setLoading(false);
      setPool(null);
      return;
    }
    const poolAddress = poolPda();
    const vaultAddress = vaultPda();
    let cancelled = false;
    const load = async () => {
      try {
        const info = await connection.getAccountInfo(poolAddress);
        if (!info) {
          if (!cancelled) {
            setPool(null);
            setError("");
            setLoading(false);
          }
          return;
        }
        const decoded = program.coder.accounts.decode("pool", info.data) as object;
        let vaultBalance = 0n;
        try {
          vaultBalance = (await getAccount(connection, vaultAddress)).amount;
        } catch {
          vaultBalance = 0n;
        }
        if (cancelled) return;
        setPool({
          symbol: String(readField(decoded, "stock_symbol") ?? TSLA_SYMBOL),
          authority: String(readField(decoded, "authority")),
          usdcMint: String(readField(decoded, "usdc_mint")),
          demoMode: Boolean(readField(decoded, "demo_mode")),
          demoPricesSet: Boolean(readField(decoded, "demo_prices_set")),
          demoReferencePrice: toBig(readField(decoded, "demo_reference_price")),
          demoSettlementPrice: toBig(readField(decoded, "demo_settlement_price")),
          totalShares: toBig(readField(decoded, "total_lp_shares")),
          outstanding: toBig(readField(decoded, "outstanding_notional")),
          premiums: toBig(readField(decoded, "premiums_collected")),
          vaultBalance,
        });
        setError("");
        setLoading(false);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Could not load the pool");
        setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    const sub = connection.onAccountChange(poolAddress, () => void load());
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      void connection.removeAccountChangeListener(sub);
    };
  }, [addressKey, connection, program, reloadToken, vaultKey]);

  return {
    pool,
    loading,
    error,
    reload: () => setReloadToken((value) => value + 1),
    poolAddress: address,
    vaultAddress: vault,
    demoMode: pool?.demoMode ?? false,
  };
}
