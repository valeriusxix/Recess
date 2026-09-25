import { AnchorProvider, Program, type Idl } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { Keypair, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { useMemo } from "react";
import { recessIdl } from "../lib/anchorClient";

/** Lets the pool account load before anyone connects a wallet. It cannot sign. */
const readOnlyKey = Keypair.generate();
const readOnlyWallet = {
  publicKey: readOnlyKey.publicKey,
  signTransaction: async <T extends Transaction | VersionedTransaction>(_tx: T): Promise<T> => {
    throw new Error("Connect a wallet to sign");
  },
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(_txs: T[]): Promise<T[]> => {
    throw new Error("Connect a wallet to sign");
  },
};

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const provider = useMemo(() => {
    return new AnchorProvider(connection, wallet ?? readOnlyWallet, { commitment: "confirmed" });
  }, [connection, wallet]);
  const program = useMemo(() => new Program(recessIdl as Idl, provider), [provider]);
  return { connection, wallet, provider, program, ready: wallet != null };
}
