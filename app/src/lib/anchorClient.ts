import {
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import idl from "../idl/recess.json";
import { clusterName } from "./cluster";
import { TSLA_FEED_ID, TSLA_SYMBOL } from "./pyth";

/** Policy account discriminator, sha256("account:Policy")[..8]. */
export const POLICY_DISC = Buffer.from([222, 135, 7, 163, 235, 177, 33, 68]);

export function ensureAtaIx(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  ata: PublicKey
): TransactionInstruction {
  return createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mint, TOKEN_PROGRAM_ID);
}

export const PROGRAM_ID = new PublicKey("DHMDwSXWxcdtRWRrg93KCpCqDFbYNKDnMQUV2MdEbKem");

export const DEVNET_RPC = "https://api.devnet.solana.com";
export const MAINNET_RPC = "https://api.mainnet-beta.solana.com";
export const RPC_ENDPOINT = clusterName() === "mainnet-beta" ? MAINNET_RPC : DEVNET_RPC;

/** Public devnet sometimes accepts a request and never answers. */
export function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  if (init?.signal) {
    if (init.signal.aborted) ctrl.abort();
    else init.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/** Circle devnet USDC, 6 decimals. */
export const DEVNET_USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

/** Circle mainnet USDC, 6 decimals. */
export const MAINNET_USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export const USDC_MINT = clusterName() === "mainnet-beta" ? MAINNET_USDC_MINT : DEVNET_USDC_MINT;

export const recessIdl = idl;

export function feedIdArray(): number[] {
  return Array.from(Buffer.from(TSLA_FEED_ID, "hex"));
}

export function poolPda(symbol = TSLA_SYMBOL): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), Buffer.from(symbol)],
    PROGRAM_ID
  )[0];
}

export function vaultPda(symbol = TSLA_SYMBOL): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), Buffer.from(symbol)],
    PROGRAM_ID
  )[0];
}

export function lpPositionPda(pool: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("lp"), pool.toBuffer(), owner.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function policyPda(owner: PublicKey, pool: PublicKey, startTs: bigint): PublicKey {
  const bytes = Buffer.alloc(8);
  bytes.writeBigInt64LE(startTs);
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), pool.toBuffer(), bytes],
    PROGRAM_ID
  )[0];
}

export function txError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Transaction failed";
}

export function readField(account: object, name: string): unknown {
  const record = account as Record<string, unknown>;
  if (name in record) return record[name];
  const camel = name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  return record[camel];
}

export { SystemProgram };
