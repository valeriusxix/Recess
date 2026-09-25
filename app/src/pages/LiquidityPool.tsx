import { BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { DemoAdminPanel } from "../components/DemoAdminPanel";
import { DemoModeBadge } from "../components/DemoModeBadge";
import { LiquidityForm } from "../components/LiquidityForm";
import { PoolStatsPanel } from "../components/PoolStatsPanel";
import { usePool } from "../hooks/usePool";
import { useProgram } from "../hooks/useProgram";
import {
  ensureAtaIx,
  feedIdArray,
  lpPositionPda,
  poolPda,
  SystemProgram,
  txError,
  vaultPda,
} from "../lib/anchorClient";
import { clusterName } from "../lib/cluster";
import { useCluster } from "../hooks/useCluster";
import { decimalToAtoms, formatUsdc } from "../lib/format";
import { TSLA_SYMBOL } from "../lib/pyth";

export function LiquidityPool() {
  const { label, usdcMint } = useCluster();
  const { program, wallet } = useProgram();
  const { pool, loading, error, reload, demoMode } = usePool();
  const [message, setMessage] = useState("");
  const [createDemo, setCreateDemo] = useState(clusterName() !== "mainnet-beta");
  const isAuthority = Boolean(wallet && pool && wallet.publicKey.toBase58() === pool.authority);

  async function initialize() {
    if (!program || !wallet) return;
    setMessage("");
    try {
      await program.methods
        .initializePool(TSLA_SYMBOL, feedIdArray(), createDemo)
        .accountsPartial({
          authority: wallet.publicKey,
          pool: poolPda(),
          vault: vaultPda(),
          usdcMint: usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setMessage(createDemo ? "TSLA pool created in demo mode." : "TSLA pool created. Buys and claims use Pyth.");
    } catch (error) {
      setMessage(txError(error));
    }
  }

  async function deposit(amount: string) {
    if (!program || !wallet || !pool) return;
    if (pool.usdcMint !== usdcMint.toBase58()) {
      setMessage("This pool's mint is not the USDC mint for this cluster. Deposit is disabled.");
      return;
    }
    const atoms = decimalToAtoms(amount, 6);
    const mint = new PublicKey(pool.usdcMint);
    const lpUsdc = await getAssociatedTokenAddress(mint, wallet.publicKey);
    await program.methods
      .depositLiquidity(new BN(atoms.toString()))
      .accountsPartial({
        lp: wallet.publicKey,
        pool: poolPda(),
        lpPosition: lpPositionPda(poolPda(), wallet.publicKey),
        lpUsdc,
        vault: vaultPda(),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .preInstructions([ensureAtaIx(wallet.publicKey, wallet.publicKey, mint, lpUsdc)])
      .rpc();
    setMessage("Deposit sent.");
  }

  async function withdraw(amount: string) {
    if (!program || !wallet || !pool) return;
    const shares = decimalToAtoms(amount, 6);
    const mint = new PublicKey(pool.usdcMint);
    const lpUsdc = await getAssociatedTokenAddress(mint, wallet.publicKey);
    await program.methods
      .withdrawLiquidity(new BN(shares.toString()))
      .accountsPartial({
        lp: wallet.publicKey,
        pool: poolPda(),
        lpPosition: lpPositionPda(poolPda(), wallet.publicKey),
        lpUsdc,
        vault: vaultPda(),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    setMessage("Withdrawal sent.");
  }

  async function setDemoPrices(reference: string, settlement: string) {
    if (!program || !wallet) return;
    await program.methods
      .setDemoPrices(new BN(decimalToAtoms(reference, 8).toString()), new BN(decimalToAtoms(settlement, 8).toString()))
      .accountsPartial({
        authority: wallet.publicKey,
        pool: poolPda(),
      })
      .rpc();
    setMessage("Demo prices updated.");
  }

  const mintMatches = pool?.usdcMint === usdcMint.toBase58();
  const vault = pool ? formatUsdc(pool.vaultBalance) : "—";
  const utilization =
    pool && pool.vaultBalance > 0n
      ? `${((Number(pool.outstanding) / Number(pool.vaultBalance)) * 100).toFixed(1)}%`
      : "—";
  const yieldText =
    pool && pool.vaultBalance > 0n
      ? `${((Number(pool.premiums) / Number(pool.vaultBalance)) * 100).toFixed(2)}%`
      : "—";

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8">
      <h1 className="text-3xl">Liquidity pool</h1>
      <p className="text-sm text-stone-600">{label}</p>
      <DemoModeBadge demoMode={demoMode} />
      {loading && <p>Loading pool…</p>}
      {!loading && error && (
        <section className="flex flex-col gap-3">
          <p>The pool did not load. {error}</p>
          <button
            type="button"
            onClick={reload}
            className="w-fit rounded bg-stone-900 px-4 py-2 text-[#f4f0e6]"
          >
            Retry
          </button>
        </section>
      )}
      {!loading && !error && !pool && (
        <section className="flex flex-col gap-3">
          <p>
            No TSLA pool on this cluster yet. It will use {usdcMint.toBase58()}.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createDemo}
              onChange={(event) => setCreateDemo(event.target.checked)}
            />
            Demo mode. Prices come from the admin panel instead of Pyth. Leave this off for a live pool.
          </label>
          <button
            type="button"
            disabled={!wallet}
            onClick={() => void initialize().catch((error: unknown) => setMessage(txError(error)))}
            className="w-fit rounded bg-stone-900 px-4 py-2 text-[#f4f0e6] disabled:opacity-40"
          >
            {createDemo ? "Create demo TSLA pool" : "Create live TSLA pool"}
          </button>
        </section>
      )}
      {pool && (
        <>
          <PoolStatsPanel balanceUsdc={vault} utilization={utilization} apy={yieldText} mint={pool.usdcMint} />
          {!mintMatches && (
            <p>This mint is not the USDC mint for this cluster. Deposits stay disabled.</p>
          )}
          <LiquidityForm
            mode="deposit"
            disabled={!wallet || !mintMatches}
            onSubmit={async (amount) => {
              try {
                await deposit(amount);
              } catch (error) {
                setMessage(txError(error));
              }
            }}
          />
          <LiquidityForm
            mode="withdraw"
            disabled={!wallet}
            onSubmit={async (amount) => {
              try {
                await withdraw(amount);
              } catch (error) {
                setMessage(txError(error));
              }
            }}
          />
          <p className="text-sm text-stone-600">
            Withdraw shares are 1:1 with the USDC you deposited while you are the only LP. A withdrawal that would leave the vault below open notionals is rejected.
          </p>
        </>
      )}
      <DemoAdminPanel
        visible={demoMode && isAuthority}
        onSubmit={async (reference, settlement) => {
          try {
            await setDemoPrices(reference, settlement);
          } catch (error) {
            setMessage(txError(error));
          }
        }}
      />
      {message && <p role="status">{message}</p>}
    </main>
  );
}
