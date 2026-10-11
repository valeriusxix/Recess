function DemoAdminPanel({
  referenceText,
  settlementText,
  onReference,
  onSettlement,
  onSubmit,
  pending,
  canSend,
  notice,
}) {
  return (
    <form className="product-card demo-panel" onSubmit={onSubmit}>
      <p className="product-kicker">DEMO MODE</p>
      <h2>Set demo prices</h2>
      <p>
        These two prints settle every open policy while demo mode is on. They are not a live market.
        Only the pool authority can send them.
      </p>
      <label className="product-field" htmlFor="demo-reference">
        Open print (USD)
        <input
          id="demo-reference"
          inputMode="decimal"
          value={referenceText}
          onChange={(event) => onReference(event.target.value)}
        />
      </label>
      <label className="product-field" htmlFor="demo-settlement">
        Close print (USD)
        <input
          id="demo-settlement"
          inputMode="decimal"
          value={settlementText}
          onChange={(event) => onSettlement(event.target.value)}
        />
      </label>
      {notice ? <p className="product-status" role="status">{notice}</p> : null}
      <button className="product-primary" disabled={pending} type="submit">
        {pending ? "Waiting for wallet…" : "Set demo prices"}
      </button>
      {!canSend ? <p className="product-note">Only the pool authority can send this. Connect that wallet first.</p> : null}
    </form>
  );
}

export default DemoAdminPanel;
