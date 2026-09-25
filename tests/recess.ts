import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Recess } from "../target/types/recess";
import idl from "../target/idl/recess.json";
import {
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

const USDC = 1_000_000;
const PRICE = 100_000_000;
// Equity.US.TSLA/USD. Confirmed against Pyth symbology on 2026-09-25.
const TSLA_FEED_ID = Buffer.from(
  "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
  "hex"
);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function i64Le(value: number): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigInt64LE(BigInt(value));
  return bytes;
}

function errorBlob(error: unknown): string {
  const err = error as {
    error?: { errorCode?: { code?: string } };
    message?: string;
    logs?: string[];
  };
  return [err.error?.errorCode?.code ?? "", err.message ?? "", ...(err.logs ?? [])].join("\n");
}

describe("recess", function () {
  this.timeout(600_000);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program<Recess>(idl, provider);
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  const onDevnet = connection.rpcEndpoint.includes("devnet");
  const symbol = onDevnet ? `T${Date.now().toString().slice(-7)}` : "TSLA";

  const lp = anchor.web3.Keypair.generate();
  const buyer = anchor.web3.Keypair.generate();

  let mint: anchor.web3.PublicKey;
  let poolPda: anchor.web3.PublicKey;
  let vaultPda: anchor.web3.PublicKey;
  let lpPositionPda: anchor.web3.PublicKey;
  let lpAta: anchor.web3.PublicKey;
  let buyerAta: anchor.web3.PublicKey;

  let gapStart = 0;
  let flatStart = 0;
  let windowEnd = 0;

  async function currentTs(): Promise<number> {
    const slot = await connection.getSlot("confirmed");
    const blockTime = await connection.getBlockTime(slot);
    return blockTime ?? Math.floor(Date.now() / 1000);
  }

  async function fund(pubkey: anchor.web3.PublicKey, sol: number) {
    const target = sol * anchor.web3.LAMPORTS_PER_SOL;
    // Devnet rejects multi-SOL airdrops. Ask for 1 SOL at a time.
    const chunk = anchor.web3.LAMPORTS_PER_SOL;
    let lastError: unknown;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const balance = await connection.getBalance(pubkey);
        if (balance >= target) return;
        const signature = await connection.requestAirdrop(
          pubkey,
          Math.min(chunk, target - balance)
        );
        const latest = await connection.getLatestBlockhash();
        await connection.confirmTransaction(
          { signature, ...latest },
          "confirmed"
        );
      } catch (error) {
        lastError = error;
        await sleep(1500 * (attempt + 1));
      }
    }
    const balance = await connection.getBalance(pubkey);
    if (balance >= target) return;
    if (pubkey.equals(payer.publicKey)) {
      throw lastError ?? new Error("could not fund the payer");
    }
    const payerBalance = await connection.getBalance(payer.publicKey);
    const needed = target - balance;
    if (payerBalance < needed + 20_000) {
      throw lastError ?? new Error("payer cannot cover the funding transfer");
    }
    const tx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: pubkey,
        lamports: needed,
      })
    );
    await provider.sendAndConfirm(tx, [payer]);
  }

  async function usdcBalance(owner: anchor.web3.PublicKey): Promise<bigint> {
    const account = await getAccount(connection, owner);
    return account.amount;
  }

  function policyPda(startTs: number): anchor.web3.PublicKey {
    const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
      [buyer.publicKey.toBuffer(), poolPda.toBuffer(), i64Le(startTs)],
      program.programId
    );
    return pda;
  }

  async function setDemoPrices(referenceDollars: number, settlementDollars: number) {
    await program.methods
      .setDemoPrices(
        new BN(referenceDollars * PRICE),
        new BN(settlementDollars * PRICE)
      )
      .accountsPartial({
        authority: payer.publicKey,
        pool: poolPda,
      })
      .rpc();
  }

  async function buy(startTs: number, endTs: number, notionalUsdc: number, thresholdBps: number) {
    await program.methods
      .buyCoverage(
        new BN(notionalUsdc * USDC),
        thresholdBps,
        new BN(startTs),
        new BN(endTs)
      )
      .accountsPartial({
        buyer: buyer.publicKey,
        pool: poolPda,
        policy: policyPda(startTs),
        buyerUsdc: buyerAta,
        vault: vaultPda,
        priceUpdate: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  }

  async function waitUntil(ts: number) {
    const deadline = Date.now() + (onDevnet ? 240_000 : 90_000);
    for (;;) {
      const now = await currentTs();
      if (now >= ts) return;
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for chain time ${ts}, last seen ${now}`);
      }
      await sleep(Math.min(5_000, Math.max(1_000, (ts - now) * 1_000)));
    }
  }

  async function settle(startTs: number) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await program.methods
          .settlePolicy()
          .accountsPartial({
            settler: payer.publicKey,
            pool: poolPda,
            policy: policyPda(startTs),
            vault: vaultPda,
            ownerUsdc: buyerAta,
            tokenProgram: TOKEN_PROGRAM_ID,
            priceUpdate: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        return;
      } catch (error) {
        lastError = error;
        if (!errorBlob(error).includes("WindowStillOpen") || attempt === 5) {
          throw error;
        }
        await sleep(2000);
      }
    }
    throw lastError;
  }

  before(async () => {
    const payerBalance = await connection.getBalance(payer.publicKey);
    if (payerBalance < 2 * anchor.web3.LAMPORTS_PER_SOL) {
      await fund(payer.publicKey, 5);
    }
    await fund(lp.publicKey, 1);
    await fund(buyer.publicKey, 1);

    mint = await createMint(connection, payer, payer.publicKey, null, 6);
    [poolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), Buffer.from(symbol)],
      program.programId
    );
    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), Buffer.from(symbol)],
      program.programId
    );
    [lpPositionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("lp"), poolPda.toBuffer(), lp.publicKey.toBuffer()],
      program.programId
    );

    const lpToken = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      lp.publicKey
    );
    const buyerToken = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      buyer.publicKey
    );
    lpAta = lpToken.address;
    buyerAta = buyerToken.address;

    await mintTo(connection, payer, mint, lpAta, payer, 20_000 * USDC);
    await mintTo(connection, payer, mint, buyerAta, payer, 5_000 * USDC);

    await program.methods
      .initializePool(symbol, Array.from(TSLA_FEED_ID), true)
      .accountsPartial({
        authority: payer.publicKey,
        pool: poolPda,
        vault: vaultPda,
        usdcMint: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  });

  it("deposits liquidity and mints LP shares", async () => {
    const amount = 10_000 * USDC;
    await program.methods
      .depositLiquidity(new BN(amount))
      .accountsPartial({
        lp: lp.publicKey,
        pool: poolPda,
        lpPosition: lpPositionPda,
        lpUsdc: lpAta,
        vault: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([lp])
      .rpc();

    const pool = await program.account.pool.fetch(poolPda);
    const position = await program.account.lpPosition.fetch(lpPositionPda);
    const vault = await usdcBalance(vaultPda);

    assert.equal(pool.stockSymbol, symbol);
    assert.equal(pool.demoMode, true);
    assert.deepEqual(Buffer.from(pool.pythFeedId), TSLA_FEED_ID);
    assert.equal(pool.totalLpShares.toNumber(), amount);
    assert.equal(position.shares.toNumber(), amount);
    assert.equal(vault, BigInt(amount));
    assert.equal(await usdcBalance(lpAta), BigInt(10_000 * USDC));
  });

  it("buys coverage and pulls the tier premium into the vault", async () => {
    const now = await currentTs();
    gapStart = now - 120;
    flatStart = now - 60;
    // Devnet confirms slowly. The window has to still be open when the
    // second buy lands, then settle waits it out.
    windowEnd = now + (onDevnet ? 150 : 25);

    await setDemoPrices(200, 200);
    const before = await usdcBalance(buyerAta);
    await buy(gapStart, windowEnd, 1_000, 500);

    const policy = await program.account.policy.fetch(policyPda(gapStart));
    const pool = await program.account.pool.fetch(poolPda);

    assert.equal(policy.notional.toNumber(), 1_000 * USDC);
    assert.equal(policy.thresholdBps, 500);
    assert.equal(policy.premiumPaid.toNumber(), 15 * USDC);
    assert.equal(policy.referencePrice.toNumber(), 200 * PRICE);
    assert.equal(Object.keys(policy.status)[0], "active");
    assert.equal(policy.payoutAmount.toNumber(), 0);
    assert.equal(pool.outstandingNotional.toNumber(), 1_000 * USDC);
    assert.equal(pool.premiumsCollected.toNumber(), 15 * USDC);
    assert.equal(before - (await usdcBalance(buyerAta)), BigInt(15 * USDC));
    assert.equal(await usdcBalance(vaultPda), BigInt(10_015 * USDC));
  });

  it("blocks a withdrawal that would starve an active policy", async () => {
    const pool = await program.account.pool.fetch(poolPda);
    try {
      await program.methods
        .withdrawLiquidity(pool.totalLpShares)
        .accountsPartial({
          lp: lp.publicKey,
          pool: poolPda,
          lpPosition: lpPositionPda,
          lpUsdc: lpAta,
          vault: vaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([lp])
        .rpc();
      assert.fail("withdrawal should have been rejected");
    } catch (error) {
      assert.include(errorBlob(error), "WithdrawalWouldStarvePayouts");
    }
  });

  it("settles a forced adverse gap and pays the holder", async () => {
    await buy(flatStart, windowEnd, 1_000, 500);
    await setDemoPrices(200, 170);
    await waitUntil(windowEnd);

    const before = await usdcBalance(buyerAta);
    await settle(gapStart);

    const policy = await program.account.policy.fetch(policyPda(gapStart));
    const pool = await program.account.pool.fetch(poolPda);
    // $200 → $170 is a 15% drop. The 5% threshold pays the extra 10%.
    assert.equal(policy.payoutAmount.toNumber(), 100 * USDC);
    assert.equal(Object.keys(policy.status)[0], "settled");
    assert.equal((await usdcBalance(buyerAta)) - before, BigInt(100 * USDC));
    // The flat policy is still active, so one notional remains reserved.
    assert.equal(pool.outstandingNotional.toNumber(), 1_000 * USDC);
  });

  it("settles a flat reopen with a zero payout", async () => {
    await setDemoPrices(200, 200);
    const before = await usdcBalance(buyerAta);
    await settle(flatStart);

    const policy = await program.account.policy.fetch(policyPda(flatStart));
    const pool = await program.account.pool.fetch(poolPda);
    assert.equal(policy.payoutAmount.toNumber(), 0);
    assert.equal(Object.keys(policy.status)[0], "settled");
    assert.equal(await usdcBalance(buyerAta), before);
    assert.equal(pool.outstandingNotional.toNumber(), 0);
    // 10_000 deposited + 15 + 15 premiums − 100 payout.
    assert.equal(await usdcBalance(vaultPda), BigInt(9_930 * USDC));
  });

  it("withdraws the remaining LP liquidity", async () => {
    const poolBefore = await program.account.pool.fetch(poolPda);
    const lpBefore = await usdcBalance(lpAta);

    await program.methods
      .withdrawLiquidity(poolBefore.totalLpShares)
      .accountsPartial({
        lp: lp.publicKey,
        pool: poolPda,
        lpPosition: lpPositionPda,
        lpUsdc: lpAta,
        vault: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([lp])
      .rpc();

    const pool = await program.account.pool.fetch(poolPda);
    const position = await program.account.lpPosition.fetch(lpPositionPda);
    assert.equal(pool.totalLpShares.toNumber(), 0);
    assert.equal(position.shares.toNumber(), 0);
    assert.equal(await usdcBalance(vaultPda), BigInt(0));
    assert.equal((await usdcBalance(lpAta)) - lpBefore, BigInt(9_930 * USDC));
  });
});
