import { useEffect, useState } from "react";
import { formatUsdc, gapPercent, toBig } from "../lib/format";
import { poolPda, readField } from "../lib/anchorClient";
import { usePool } from "./usePool";
import { useProgram } from "./useProgram";

export type PolicySummary = {
  id: string;
  notionalUsdc: string;
  premiumUsdc: string;
  payoutUsdc: string;
  thresholdBps: number;
  gapPct: string;
  status: string;
  claimable: boolean;
  endTs: number;
};

function statusName(status: unknown): string {
  if (typeof status === "string") return status.toLowerCase();
  if (status && typeof status === "object") {
    return (Object.keys(status)[0] ?? "unknown").toLowerCase();
  }
  return "unknown";
}

export function usePolicies(liveMark: bigint | null) {
  const { connection, program, wallet } = useProgram();
  const { pool } = usePool();
  const [policies, setPolicies] = useState<PolicySummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!program || !wallet) {
      setPolicies([]);
      return;
    }
    const owner = wallet.publicKey;
    const poolKey = poolPda();
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const accounts = await connection.getProgramAccounts(program.programId, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: "eDo7mNQe33q",
            },
          },
          { memcmp: { offset: 8, bytes: owner.toBase58() } },
          { memcmp: { offset: 40, bytes: poolKey.toBase58() } },
        ],
      });
      const now = Math.floor(Date.now() / 1000);
      const next = accounts.map(({ pubkey, account }) => {
        const decoded = program.coder.accounts.decode("policy", account.data) as object;
        const status = statusName(readField(decoded, "status"));
        const endTs = Number(toBig(readField(decoded, "coverage_end_ts")));
        const reference = toBig(readField(decoded, "reference_price"));
        const mark = pool?.demoMode ? pool.demoSettlementPrice : liveMark;
        return {
          id: pubkey.toBase58(),
          notionalUsdc: formatUsdc(toBig(readField(decoded, "notional"))),
          premiumUsdc: formatUsdc(toBig(readField(decoded, "premium_paid"))),
          payoutUsdc: formatUsdc(toBig(readField(decoded, "payout_amount"))),
          thresholdBps: Number(readField(decoded, "threshold_bps") ?? 0),
          gapPct: mark === null ? "—" : gapPercent(reference, mark),
          status,
          claimable: status === "active" && now >= endTs,
          endTs,
        };
      });
      if (!cancelled) {
        setPolicies(next);
        setLoading(false);
      }
    };
    void load().catch(() => {
      if (!cancelled) setLoading(false);
    });
    const timer = window.setInterval(() => void load().catch(() => undefined), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [connection, liveMark, pool, program, wallet]);

  return { policies, loading };
}
