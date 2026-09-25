import { useState } from "react";

type LiquidityFormProps = {
  mode: "deposit" | "withdraw";
  disabled?: boolean;
  onSubmit: (amount: string) => Promise<void>;
};

export function LiquidityForm({ mode, disabled, onSubmit }: LiquidityFormProps) {
  const label = mode === "deposit" ? "Deposit" : "Withdraw";
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void onSubmit(amount).finally(() => setBusy(false));
      }}
    >
      <label className="flex flex-col text-sm">
        {label} USDC
        <input
          name="amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="mt-1 rounded border border-stone-300 bg-white px-2 py-1"
        />
      </label>
      <button
        type="submit"
        disabled={disabled || busy || amount.length === 0}
        className="rounded bg-stone-900 px-3 py-2 text-sm text-[#f4f0e6] disabled:opacity-40"
      >
        {busy ? "Sending…" : label}
      </button>
    </form>
  );
}
