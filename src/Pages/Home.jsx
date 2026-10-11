import { useState } from "react";
import ThresholdPicker from "../Components/ThresholdPicker";
import { usePoolState } from "../hooks/usePoolState";
import { useSettlement } from "../hooks/useSettlement";
import { formatThreshold, formatUsdt, formatWhen, parseUsdt } from "../lib/format";
import { premiumOf } from "../lib/pricing";
import { nextWeekendWindow } from "../lib/windows";
import "./Home.css";

function Home() {
  const { pool } = usePoolState();
  const { selected } = useSettlement();
  const symbol = selected.symbol;
  const demoRelease = pool?.demoMode !== false;
  const weekend = nextWeekendWindow();
  const [notionalText, setNotionalText] = useState("20");
  const [thresholdBps, setThresholdBps] = useState(500);
  const notional = parseUsdt(notionalText);
  const quote = notional == null ? null : premiumOf(notional, thresholdBps);
  const buyWindow = demoRelease ? "hour" : "weekend";
  const buyHref = `/coverage?notional=${encodeURIComponent(notionalText.trim())}&tier=${quote?.tier.thresholdBps || thresholdBps}&window=${buyWindow}`;

  return (
    <div className="home">
      <section className="home-hero">
        <div>
          <p className="product-kicker">BNB Smart Chain · TSLAB</p>
          <h1>Cover the weekend gap.</h1>
          <p className="product-lede">
            Tokenized Tesla keeps trading while the New York market is closed. Recess lets you pay a
            USDT or USDC premium before that window and get paid in that same token if the printed
            price gaps down past the threshold you chose.
          </p>
          <p className="product-note">Recess does not take custody of the stock. The payout follows the printed prices. USDT and USDC each have their own pool.</p>
        </div>
        <article className="product-card window-card">
          <p className="product-kicker">{demoRelease ? "Weekend cover" : "Next coverage window"}</p>
          <h2>Friday close to Monday open</h2>
          <p>Friday 16:00 ET to Monday 09:30 ET.</p>
          <p>{formatWhen(weekend.start)}</p>
          <p>{formatWhen(weekend.end)}</p>
        </article>
      </section>

      <section className="product-card quote-card" aria-labelledby="quote-title">
        <div>
          <h2 id="quote-title">Price a cover</h2>
          <p>The premium is a flat tier of the amount you want covered. It is not a volatility forecast.</p>
        </div>
        <label className="product-field" htmlFor="home-notional">
          Notional ({symbol})
          <input
            id="home-notional"
            inputMode="decimal"
            value={notionalText}
            onChange={(event) => setNotionalText(event.target.value)}
          />
        </label>
        <ThresholdPicker value={quote?.tier.thresholdBps || thresholdBps} onChange={setThresholdBps} />
        <div className="quote-result">
          {notional == null ? (
            <p>Enter an amount in {symbol}.</p>
          ) : quote.tooSmall ? (
            <p>That premium rounds to zero. Use a larger amount.</p>
          ) : (
            <p>
              <strong>{formatUsdt(quote.premium)} {symbol}</strong>
              <span>
                {" "}
                premium for {formatUsdt(notional)} {symbol} at a {formatThreshold(quote.tier.thresholdBps)} gap
              </span>
            </p>
          )}
          {notional == null || quote?.tooSmall ? (
            <span className="product-primary is-disabled">Continue to buy</span>
          ) : (
            <a className="product-primary" href={buyHref}>Continue to buy</a>
          )}
          {demoRelease ? (
            <p className="product-note">
              This release buys the one-hour window, so a cover can be settled today. The weekend window stays on the cover page.
            </p>
          ) : null}
        </div>
      </section>

      <section className="step-grid" aria-label="How cover works">
        <article>
          <span>1</span>
          <h2>Choose the gap</h2>
          <p>2%, 5%, or 10%. A tighter gap costs a higher premium.</p>
        </article>
        <article>
          <span>2</span>
          <h2>Pay the premium</h2>
          <p>{symbol} from a wallet on BNB Smart Chain. The stock stays in your wallet.</p>
        </article>
        <article>
          <span>3</span>
          <h2>Get paid if it prints</h2>
          <p>If the close is far enough below the open, the payout is sent in {symbol}. A flat or rising print pays nothing.</p>
        </article>
      </section>
    </div>
  );
}

export default Home;
