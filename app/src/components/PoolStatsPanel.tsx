type PoolStatsPanelProps = {
  balanceUsdc: string;
  utilization: string;
  apy: string;
  mint: string;
};

export function PoolStatsPanel({ balanceUsdc, utilization, apy, mint }: PoolStatsPanelProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      <p className="rounded border border-stone-300 bg-white/70 p-3">Vault {balanceUsdc} USDC</p>
      <p className="rounded border border-stone-300 bg-white/70 p-3">Utilization {utilization}</p>
      <p className="rounded border border-stone-300 bg-white/70 p-3">Premium yield {apy}</p>
      <p className="break-all rounded border border-stone-300 bg-white/70 p-3 sm:col-span-3">
        Mint {mint}
      </p>
    </section>
  );
}
