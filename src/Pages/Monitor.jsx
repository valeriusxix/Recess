import VenueCard from "../Components/VenueCard";
import { shownPrice, useQuotes } from "../hooks/useQuotes";
import { TOKENS } from "../lib/tokens";

function feedCopy(error) {
  if (error === "MISSING_BINANCE_WEB3_KEYS") {
    return "The Binance Web3 keys are not set, so no price is shown.";
  }
  if (error) return "The price feed did not return a usable print, so no price is shown.";
  return "Live prints come from the Binance Web3 price feed. A missing field stays blank.";
}

function Monitor() {
  const { quotes, error } = useQuotes();
  const prices = quotes?.prices || null;
  const statusInfo = quotes?.statusInfo || null;

  return (
    <section className="stack-page">
      <header className="page-intro">
        <p className="product-kicker">Printed prices</p>
        <h1>Gap monitor</h1>
        <p>
          Cover follows TSLAB. Ondo and xStocks are here for comparison only. Recess does not hold any of these tokens.
          {" "}{feedCopy(error)}
        </p>
      </header>
      <div className="venue-grid">
        <VenueCard
          covered
          marketPrice={shownPrice(prices?.tslab?.marketPrice)}
          referencePrice={shownPrice(prices?.tslab?.referencePrice)}
          token={TOKENS.tslab}
          tokenPrice={shownPrice(prices?.tslab?.tokenPrice)}
        />
        <VenueCard
          marketPrice={shownPrice(prices?.tslaon?.marketPrice)}
          referencePrice={shownPrice(prices?.tslaon?.referencePrice)}
          token={TOKENS.tslaon}
          tokenPrice={shownPrice(prices?.tslaon?.tokenPrice)}
        />
        <VenueCard
          marketPrice={shownPrice(prices?.tslax?.marketPrice)}
          referencePrice={shownPrice(prices?.tslax?.referencePrice)}
          token={TOKENS.tslax}
          tokenPrice={shownPrice(prices?.tslax?.tokenPrice)}
        />
      </div>
      <article className="product-card market-note">
        <h2>US session</h2>
        <p>
          The coverage window is Friday 16:00 ET through Monday 09:30 ET. The lines below are the feed's statusInfo
          fields. Next-open and next-close names are not assumed.
        </p>
        {statusInfo ? (
          <>
            <dl className="stat-list">
              <div>
                <dt>openState</dt>
                <dd>{String(statusInfo.openState)}</dd>
              </div>
              <div>
                <dt>marketStatus</dt>
                <dd>{String(statusInfo.marketStatus)}</dd>
              </div>
              <div>
                <dt>reasonCode</dt>
                <dd>{statusInfo.reasonCode == null ? "null" : String(statusInfo.reasonCode)}</dd>
              </div>
            </dl>
            <pre className="market-raw">{JSON.stringify(statusInfo, null, 2)}</pre>
          </>
        ) : (
          <p>Session status is blank. Nothing is guessed.</p>
        )}
      </article>
    </section>
  );
}

export default Monitor;
