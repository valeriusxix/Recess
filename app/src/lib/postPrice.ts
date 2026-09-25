import {
  PRO_COMPATIBLE_RECEIVER_PROGRAM_ID,
  PRO_COMPATIBLE_WORMHOLE_PROGRAM_ID,
  PythSolanaReceiver,
} from "@pythnetwork/pyth-solana-receiver";
import {
  Connection,
  PublicKey,
  type TransactionInstruction,
  type VersionedTransaction,
} from "@solana/web3.js";
import { fetchHermesUpdate, TSLA_FEED_ID_0X } from "./pyth";

type SigningWallet = {
  publicKey: PublicKey;
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
};

/**
 * Post a fully verified TSLA update to the upgraded Pyth receiver and run
 * `instruction` against that PriceUpdateV2 in the same sequence.
 * The update account is closed at the end so the rent comes back.
 */
export async function sendWithPriceUpdate(args: {
  connection: Connection;
  wallet: SigningWallet;
  apiKey: string;
  extraInstructions?: TransactionInstruction[];
  instruction: (priceUpdate: PublicKey) => Promise<TransactionInstruction>;
}): Promise<string> {
  const updates = await fetchHermesUpdate(args.apiKey);
  const receiver = new PythSolanaReceiver({
    connection: args.connection,
    wallet: args.wallet as unknown as ConstructorParameters<typeof PythSolanaReceiver>[0]["wallet"],
    receiverProgramId: PRO_COMPATIBLE_RECEIVER_PROGRAM_ID,
    wormholeProgramId: PRO_COMPATIBLE_WORMHOLE_PROGRAM_ID,
  });
  const builder = receiver.newTransactionBuilder({ closeUpdateAccounts: true });
  await builder.addPostPriceUpdates(updates);
  await builder.addPriceConsumerInstructions(async (getPriceUpdateAccount) => {
    const priceUpdate = getPriceUpdateAccount(TSLA_FEED_ID_0X);
    const consumer = await args.instruction(priceUpdate);
    return [...(args.extraInstructions ?? []), consumer].map((instruction) => ({
      instruction,
      signers: [],
    }));
  });
  const transactions = await builder.buildVersionedTransactions({
    computeUnitPriceMicroLamports: 100_000,
    tightComputeBudget: true,
  });

  let signature = "";
  for (const bundle of transactions) {
    const tx = bundle.tx as VersionedTransaction;
    if (bundle.signers.length > 0) tx.sign(bundle.signers);
    const signed = await args.wallet.signTransaction(tx);
    signature = await args.connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
    const latest = await args.connection.getLatestBlockhash("confirmed");
    const result = await args.connection.confirmTransaction(
      { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      "confirmed"
    );
    if (result.value.err) {
      throw new Error("The Pyth price transaction failed on-chain.");
    }
  }
  return signature;
}
