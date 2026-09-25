type PolicyCardProps = {
  notionalUsdc: string;
  premiumUsdc: string;
  payoutUsdc: string;
  thresholdBps: number;
  gapPct: string;
  status: string;
};

export function PolicyCard({
  notionalUsdc,
  premiumUsdc,
  payoutUsdc,
  thresholdBps,
  gapPct,
  status,
}: PolicyCardProps) {
  return (
    <article className="rounded border border-stone-300 bg-white/70 p-4">
      <h2 className="capitalize">{status}</h2>
      <p>Notional {notionalUsdc} USDC</p>
      <p>Premium {premiumUsdc} USDC</p>
      <p>Threshold {thresholdBps / 100}%</p>
      <p>Gap {gapPct}</p>
      <p>Payout {payoutUsdc} USDC</p>
    </article>
  );
}
