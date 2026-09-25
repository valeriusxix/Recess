import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { ClaimButton } from "../components/ClaimButton";
import { DemoModeBadge } from "../components/DemoModeBadge";
import { PolicyCard } from "../components/PolicyCard";
import { usePolicies } from "../hooks/usePolicies";
import { usePool } from "../hooks/usePool";
import { useProgram } from "../hooks/useProgram";
import { ensureAtaIx, poolPda, SystemProgram, txError, vaultPda } from "../lib/anchorClient";
import { pythApiKey } from "../lib/cluster";
import { sendWithPriceUpdate } from "../lib/postPrice";
import { useHermesPrice } from "../hooks/useHermesPrice";

export function Dashboard() {
  const { program, wallet } = useProgram();
  const { pool, demoMode } = usePool();
  const { price: livePrice } = useHermesPrice(!demoMode);
  const { policies, loading } = usePolicies(demoMode ? null : livePrice);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  async function claim(policyId: string) {
    if (!program || !wallet || !pool) return;
    setBusyId(policyId);
    setMessage("");
    try {
      const mint = new PublicKey(pool.usdcMint);
      const ownerUsdc = await getAssociatedTokenAddress(mint, wallet.publicKey);
      const ata = ensureAtaIx(wallet.publicKey, wallet.publicKey, mint, ownerUsdc);
      const accounts = {
        settler: wallet.publicKey,
        pool: poolPda(),
        policy: new PublicKey(policyId),
        vault: vaultPda(),
        ownerUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      };
      if (demoMode) {
        await program.methods
          .settlePolicy()
          .accountsPartial({ ...accounts, priceUpdate: SystemProgram.programId })
          .preInstructions([ata])
          .rpc();
      } else {
        setMessage("Posting the Pyth price, then settling…");
        await sendWithPriceUpdate({
          connection: program.provider.connection,
          wallet,
          apiKey: pythApiKey(),
          extraInstructions: [ata],
          instruction: (priceUpdate) =>
            program.methods.settlePolicy().accountsPartial({ ...accounts, priceUpdate }).instruction(),
        });
      }
      setMessage("Policy settled.");
    } catch (error) {
      setMessage(txError(error));
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <h1 className="text-3xl">Your coverage</h1>
      <DemoModeBadge demoMode={demoMode} />
      {loading && <p>Loading policies…</p>}
      {!loading && policies.length === 0 && <p>No policies yet.</p>}
      {policies.map((policy) => (
        <div key={policy.id} className="flex flex-col gap-2">
          <PolicyCard
            notionalUsdc={policy.notionalUsdc}
            premiumUsdc={policy.premiumUsdc}
            payoutUsdc={policy.payoutUsdc}
            thresholdBps={policy.thresholdBps}
            gapPct={policy.gapPct}
            status={policy.status}
          />
          <ClaimButton
            ready={policy.claimable}
            busy={busyId === policy.id}
            onClaim={() => void claim(policy.id)}
          />
        </div>
      ))}
      {message && <p role="status">{message}</p>}
    </main>
  );
}
