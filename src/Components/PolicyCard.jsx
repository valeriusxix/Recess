import { formatThreshold, formatUsdt, formatWhen } from "../lib/format";

const STATUS = ["Active", "Settled", "Expired"];

function when(seconds) {
  const millis = Number(seconds) * 1000;
  if (!Number.isFinite(millis)) return "—";
  return formatWhen(new Date(millis));
}

function PolicyCard({ policy, gapText, claimLabel, claimDisabled, onClaim, symbol = "USDT" }) {
  return (
    <article className="product-card policy-card">
      <p className="product-kicker">Policy {policy.id.toString()}</p>
      <h2>{STATUS[policy.status] || "Unknown"}</h2>
      <dl className="stat-list">
        <div>
          <dt>Notional</dt>
          <dd>{formatUsdt(policy.notional)} {symbol}</dd>
        </div>
        <div>
          <dt>Premium paid</dt>
          <dd>{formatUsdt(policy.premiumPaid)} {symbol} at a {formatThreshold(policy.thresholdBps)} gap</dd>
        </div>
        <div>
          <dt>Window</dt>
          <dd>{when(policy.coverageStartTs)} to {when(policy.coverageEndTs)}</dd>
        </div>
        <div>
          <dt>Gap</dt>
          <dd>{gapText}</dd>
        </div>
        <div>
          <dt>Payout</dt>
          <dd>{policy.status === 0 ? "Not settled" : `${formatUsdt(policy.payoutAmount)} ${symbol}`}</dd>
        </div>
      </dl>
      {policy.status === 0 ? (
        <button className="product-primary" disabled={claimDisabled} type="button" onClick={onClaim}>
          {claimLabel}
        </button>
      ) : null}
    </article>
  );
}

export default PolicyCard;
