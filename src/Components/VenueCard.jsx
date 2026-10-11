import { useState } from "react";

function shown(value) {
  return typeof value === "string" && value.trim() ? value : "—";
}

function VenueCard({ token, covered = false, tokenPrice = null, referencePrice = null, marketPrice = null }) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(token.address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="venue-card">
      <p className="product-kicker">{covered ? "Covered" : "Monitor only"}</p>
      <h2>{token.symbol}</h2>
      <p>{token.role}</p>
      <dl className="stat-list">
        <div>
          <dt>On-chain print</dt>
          <dd>{shown(tokenPrice)}</dd>
        </div>
        <div>
          <dt>Reference print</dt>
          <dd>{shown(referencePrice)}</dd>
        </div>
        <div>
          <dt>Market print</dt>
          <dd>{shown(marketPrice)}</dd>
        </div>
      </dl>
      <code>{token.address}</code>
      <button className="text-action" type="button" onClick={copyAddress}>
        {copied ? "Copied" : "Copy address"}
      </button>
    </article>
  );
}

export default VenueCard;
