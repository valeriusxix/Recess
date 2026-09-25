/**
 * Settle every active policy whose coverage window has ended.
 *
 * Manual run is enough for the demo:
 *   $env:ANCHOR_PROVIDER_URL = "http://127.0.0.1:8899"
 *   $env:ANCHOR_WALLET = "$env:USERPROFILE\.config\solana\id.json"
 *   npm run settle
 *
 * RECESS_SYMBOL defaults to TSLA. When the pool is not in demo mode, the
 * script posts a fresh Pyth update and settles against it. Set PYTH_API_KEY.
 * PRICE_UPDATE still overrides that with an existing PriceUpdateV2 account.
 */
import fs from "fs";
import path from "path";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Recess } from "../target/types/recess";
import idl from "../target/idl/recess.json";
import { sendWithPriceUpdate } from "../app/src/lib/postPrice";

function loadAppEnv(): void {
  const file = path.join(process.cwd(), "app", ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const splitAt = trimmed.indexOf("=");
    if (splitAt < 1) continue;
    const key = trimmed.slice(0, splitAt).trim();
    const value = trimmed.slice(splitAt + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadAppEnv();

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = new Program<Recess>(idl, provider);
const connection = provider.connection;
const payer = provider.wallet.publicKey;
const symbol = process.env.RECESS_SYMBOL ?? "TSLA";

function statusName(status: unknown): string {
  if (typeof status === "string") return status.toLowerCase();
  if (status && typeof status === "object") {
    return (Object.keys(status as object)[0] ?? "unknown").toLowerCase();
  }
  return "unknown";
}

async function chainNow(): Promise<number> {
  const slot = await connection.getSlot("confirmed");
  const blockTime = await connection.getBlockTime(slot);
  return blockTime ?? Math.floor(Date.now() / 1000);
}

async function main(): Promise<void> {
  const [poolPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), Buffer.from(symbol)],
    program.programId
  );
  const pool = await program.account.pool.fetch(poolPda);
  const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(symbol)],
    program.programId
  );

  let priceUpdate = anchor.web3.SystemProgram.programId;
  if (!pool.demoMode) {
    const configured = process.env.PRICE_UPDATE;
    if (!configured) {
      throw new Error("PRICE_UPDATE is required when the pool is not in demo mode");
    }
    priceUpdate = new anchor.web3.PublicKey(configured);
  }

  const policies = await program.account.policy.all([
    { memcmp: { offset: 40, bytes: poolPda.toBase58() } },
  ]);
  const now = await chainNow();
  let settled = 0;
  let failed = 0;

  for (const { publicKey, account } of policies) {
    const status = statusName(account.status);
    if (status !== "active") continue;
    const end = account.coverageEndTs.toNumber();
    if (now < end) {
      console.log(`skip ${publicKey.toBase58()} window open until ${end}`);
      continue;
    }

    const ownerUsdc = await getAssociatedTokenAddress(pool.usdcMint, account.owner);
    const createAta = createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ownerUsdc,
      account.owner,
      pool.usdcMint,
      TOKEN_PROGRAM_ID
    );
    try {
      const accounts = {
        settler: payer,
        pool: poolPda,
        policy: publicKey,
        vault,
        ownerUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      };
      const signature =
        pool.demoMode || process.env.PRICE_UPDATE
          ? await program.methods
              .settlePolicy()
              .accountsPartial({ ...accounts, priceUpdate })
              .preInstructions([createAta])
              .rpc()
          : await sendWithPriceUpdate({
              connection,
              wallet: provider.wallet,
              apiKey: process.env.PYTH_API_KEY ?? "",
              extraInstructions: [createAta],
              instruction: (posted) =>
                program.methods
                  .settlePolicy()
                  .accountsPartial({ ...accounts, priceUpdate: posted })
                  .instruction(),
            });
      settled += 1;
      console.log(`settled ${publicKey.toBase58()} ${signature}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`failed ${publicKey.toBase58()} ${message}`);
    }
  }

  console.log(`done settled=${settled} failed=${failed} scanned=${policies.length}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
