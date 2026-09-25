import { useState } from "react";

type DemoAdminPanelProps = {
  visible: boolean;
  onSubmit: (referenceDollars: string, settlementDollars: string) => Promise<void>;
};

export function DemoAdminPanel({ visible, onSubmit }: DemoAdminPanelProps) {
  const [reference, setReference] = useState("200");
  const [settlement, setSettlement] = useState("170");
  const [busy, setBusy] = useState(false);
  if (!visible) return null;
  return (
    <section className="rounded border border-amber-400 bg-amber-50 p-4">
      <h2 className="text-lg">DEMO MODE prices</h2>
      <p className="mb-3 text-sm">
        Authority-only. These values replace Pyth so a gap can be forced on demand. They are not an oracle update.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void onSubmit(reference, settlement).finally(() => setBusy(false));
        }}
      >
        <label className="flex flex-col text-sm">
          Reference USD
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className="mt-1 rounded border border-stone-300 bg-white px-2 py-1"
          />
        </label>
        <label className="flex flex-col text-sm">
          Settlement USD
          <input
            value={settlement}
            onChange={(event) => setSettlement(event.target.value)}
            className="mt-1 rounded border border-stone-300 bg-white px-2 py-1"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-amber-700 px-3 py-2 text-sm text-white disabled:opacity-40"
        >
          {busy ? "Setting…" : "Set demo prices"}
        </button>
      </form>
    </section>
  );
}
