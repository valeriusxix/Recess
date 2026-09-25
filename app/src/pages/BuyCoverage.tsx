import { BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useMemo, useState } from "react";
import { DemoModeBadge } from "../components/DemoModeBadge";
import { PremiumEstimate } from "../components/PremiumEstimate";
import { StockSelector } from "../components/StockSelector";
import { ThresholdSelector } from "../components/ThresholdSelector";
import { usePool } from "../hooks/usePool";
import { useProgram } from "../hooks/useProgram";
import { ensureAtaIx, policyPda, poolPda, SystemProgram, txError, vaultPda } from "../lib/anchorClient";
import { pythApiKey } from "../lib/cluster";
import { useCluster } from "../hooks/useCluster";
import { decimalToAtoms, formatPrice, formatUsdc, premiumFor } from "../lib/format";
import { demoWindow, fridayCloseToMondayOpen } from "../lib/marketWindow";
import { sendWithPriceUpdate } from "../lib/postPrice";
import { TSLA_SYMBOL } from "../lib/pyth";
import { useHermesPrice } from "../hooks/useHermesPrice";

export function BuyCoverage() {
  const { label } = useCluster();
  const { program, wallet } = useProgram();
  const { pool, demoMode, loading } = usePool();
  const { price: livePrice, error: livePriceError } = useHermesPrice(!demoMode);
  const [notional, setNotional] = useState("1000");
  const [thresholdBps, setThresholdBps] = useState(500);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const estimate = useMemo(() => {
    try {
      return premiumFor(decimalToAtoms(notional, 6), thresholdBps);
    } catch {
      return null;
    }
  }, [notional, thresholdBps]);

  const reference = demoMode
    ? pool && pool.demoPricesSet
      ? `$${formatPrice(pool.demoReferencePrice)}`
      : "set demo prices first"
    : livePrice !== null
      ? `$${formatPrice(livePrice)}`
      : livePriceError || "Loading Pyth…";
  const coverage = demoMode
    ? demoWindow(Math.floor(Date.now() / 1000))
    : fridayCloseToMondayOpen(Math.floor(Date.now() / 1000));

  async function buy() {
    if (!program || !wallet || !pool) return;
    setBusy(true);
    setMessage("");
    try {
      const atoms = decimalToAtoms(notional, 6);
      const chosen = demoMode ? demoWindow(Math.floor(Date.now() / 1000)) : fridayCloseToMondayOpen(Math.floor(Date.now() / 1000));
      const start = BigInt(chosen.start);
      const end = BigInt(chosen.end);
      const mint = new PublicKey(pool.usdcMint);
      const buyerUsdc = await getAssociatedTokenAddress(mint, wallet.publicKey);
      const ata = ensureAtaIx(wallet.publicKey, wallet.publicKey, mint, buyerUsdc);
      const accounts = {
        buyer: wallet.publicKey,
        pool: poolPda(),
        policy: policyPda(wallet.publicKey, poolPda(), start),
        buyerUsdc,
        vault: vaultPda(),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      };
      if (demoMode) {
        await program.methods
          .buyCoverage(new BN(atoms.toString()), thresholdBps, new BN(start.toString()), new BN(end.toString()))
          .accountsPartial({ ...accounts, priceUpdate: SystemProgram.programId })
          .preInstructions([ata])
          .rpc();
        setMessage("Coverage bought. The window ends in about three minutes, then claim it from the dashboard.");
      } else {
        const apiKey = pythApiKey();
        setMessage("Posting the Pyth price, then buying coverage…");
        await sendWithPriceUpdate({
          connection: program.provider.connection,
          wallet,
          apiKey,
          extraInstructions: [ata],
          instruction: (priceUpdate) =>
            program.methods
              .buyCoverage(new BN(atoms.toString()), thresholdBps, new BN(start.toString()), new BN(end.toString()))
              .accountsPartial({ ...accounts, priceUpdate })
              .instruction(),
        });
        setMessage(`Coverage bought for ${chosen.label}. Settle within five minutes of the Monday open.`);
      }
    } catch (error) {
      setMessage(txError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8">
      <h1 className="text-3xl">Buy coverage</h1>
      <p className="text-stone-700">
        Pay a premium on a notional amount of {TSLA_SYMBOL}. If the price gaps down past your threshold when the window ends, the pool pays you. You do not deposit the stock.
      </p>
      <p className="text-sm text-stone-600">{label}</p>
      <DemoModeBadge demoMode={demoMode} />
      <StockSelector symbol={TSLA_SYMBOL} />
      <label className="flex flex-col text-sm">
        Notional USDC
        <input
          value={notional}
          onChange={(event) => setNotional(event.target.value)}
          inputMode="decimal"
          className="mt-1 max-w-xs rounded border border-stone-300 bg-white px-2 py-1"
        />
      </label>
      <ThresholdSelector thresholdBps={thresholdBps} onChange={setThresholdBps} />
      <PremiumEstimate
        premiumUsdc={estimate ? formatUsdc(estimate.premium) : "—"}
        referencePrice={reference}
      />
      <p className="text-sm text-stone-600">
        {demoMode
          ? "This demo window starts now and ends in three minutes, so settlement can be shown without waiting for Monday."
          : `${coverage.label}. The settlement print has to land in the five minutes after the Monday open, and someone has to claim in that same stretch.`}
      </p>
      <button
        type="button"
        disabled={!wallet || !pool || busy || loading || !estimate || (!demoMode && pythApiKey().length === 0)}
        onClick={() => void buy()}
        className="w-fit rounded bg-stone-900 px-4 py-2 text-[#f4f0e6] disabled:opacity-40"
      >
        {busy ? "Buying…" : "Buy coverage"}
      </button>
      {!wallet && <p>Connect a wallet on {label} to continue.</p>}
      {!demoMode && pythApiKey().length === 0 && (
        <p>Live coverage needs VITE_PYTH_API_KEY in the app environment. Hermes will not return a price without it.</p>
      )}
      {wallet && !loading && !pool && <p>The TSLA pool is not on this cluster yet. Create it from the liquidity page.</p>}
      {message && <p role="status">{message}</p>}
    </main>
  );
}
