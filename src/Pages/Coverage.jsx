import { useRef, useState } from "react";
import AmountWarning from "../Components/AmountWarning";
import ThresholdPicker from "../Components/ThresholdPicker";
import { useBscWallet } from "../hooks/useBscWallet";
import { usePoolState } from "../hooks/usePoolState";
import { useSettlement } from "../hooks/useSettlement";
import { shownPrice, useQuotes } from "../hooks/useQuotes";
import { dollarToUsd8, formatThreshold, formatUsdt, formatWhen, parseUsdt } from "../lib/format";
import { HUNDRED_USDT, payoutOf, premiumOf } from "../lib/pricing";
import { approveUsdtIfNeeded, encodePool, txUrl } from "../lib/recess";

import { hourWindow, nextWeekendWindow } from "../lib/windows";

function initialSearch() {
  const params = new URLSearchParams(window.location.search);
  const tier = Number(params.get("tier"));
  return {
    notional: params.get("notional") || "20",
    tier: [200, 500, 1000].includes(tier) ? tier : 500,
    windowKind: params.get("window") === "hour" || params.get("window") === "weekend" ? params.get("window") : "",
  };
}

function quoteLabel(symbol, prices) {
  if (!prices) return "—";
  const row = prices[symbol];
  if (!row) return "—";
  const token = shownPrice(row.tokenPrice);
  const reference = shownPrice(row.referencePrice);
  if (!token && !reference) return "—";
  return `${token || "—"} on-chain · ${reference || "—"} reference`;
}

function Coverage() {
  const [search] = useState(initialSearch);
  const wallet = useBscWallet();
  const poolState = usePoolState();
  const { selected } = useSettlement();
  const poolAddress = selected.poolAddress;
  const poolConfigured = Boolean(poolAddress);
  const symbol = selected.symbol;
  const { quotes, error: quoteError } = useQuotes();
  const busy = useRef(false);
  const [notionalText, setNotionalText] = useState(search.notional);
  const [thresholdBps, setThresholdBps] = useState(search.tier);
  const [windowChoice, setWindowChoice] = useState(search.windowKind);
  const windowKind = windowChoice || (poolState.pool?.demoMode === false ? "weekend" : "hour");
  const [confirmedLarge, setConfirmedLarge] = useState(false);
  const [referenceText, setReferenceText] = useState("200");
  const [settlementText, setSettlementText] = useState("170");
  const [notice, setNotice] = useState("");

  const weekend = nextWeekendWindow();
  const hour = hourWindow();
  const chosen = windowKind === "hour" ? hour : weekend;
  const notional = parseUsdt(notionalText);
  const quote = notional == null ? null : premiumOf(notional, thresholdBps);
  const large = notional != null && notional > HUNDRED_USDT;
  const reference = dollarToUsd8(referenceText);
  const settlement = dollarToUsd8(settlementText);
  const whatIf = quote && reference != null && settlement != null
    ? payoutOf({
      notional,
      thresholdBps: quote.tier.thresholdBps,
      reference,
      settlement,
    })
    : null;
  const waiting = wallet.pending || wallet.sending;
  const liveTslab = quoteLabel("tslab", quotes?.prices);

  async function review(event) {
    event.preventDefault();
    if (busy.current) return;
    setNotice("");
    if (notional == null) {
      setNotice(`Enter an amount in ${symbol}.`);
      return;
    }
    if (quote.tooSmall) {
      setNotice("That premium rounds to zero. Use a larger amount.");
      return;
    }
    if (large && !confirmedLarge) {
      setNotice(`Confirm the amount above 100 ${symbol} before continuing.`);
      return;
    }
    const owner = wallet.account && wallet.onBsc ? wallet.account : await wallet.connect();
    if (!owner) return;
    if (!poolConfigured) {
      setNotice(`Quote locked in at ${formatUsdt(quote.premium)} ${symbol}. Add ${selected.envName} before this cover can be purchased on BNB Smart Chain. Nothing was sent.`);
      return;
    }

    const windowNow = windowKind === "hour" ? hourWindow() : nextWeekendWindow();
    const start = BigInt(Math.floor(windowNow.start.getTime() / 1000));
    const end = BigInt(Math.floor(windowNow.end.getTime() / 1000));
    busy.current = true;
    try {
      const approval = await approveUsdtIfNeeded({
        token: selected.tokenAddress,
        owner,
        spender: poolAddress,
        amount: quote.premium,
        send: wallet.sendTransaction,
      });
      if (!approval.ok) {
        const sent = approval.hashes.at(-1);
        setNotice(approval.error
          || (sent
            ? `The purchase was not sent. The last approval is ${txUrl(sent)}.`
            : "The purchase was not sent."));
        return;
      }
      const bought = await wallet.sendTransaction({
        to: poolAddress,
        data: encodePool("buyCoverage", [notional, BigInt(quote.tier.thresholdBps), start, end]),
      });
      if (!bought) {
        setNotice("The purchase was not sent.");
        return;
      }
      const warning = [...approval.warnings, bought.warning].filter(Boolean).join(" ");
      setNotice(`Cover purchase sent. ${txUrl(bought.hash)}${warning ? ` ${warning}` : ""}`);
      await poolState.refresh();
    } finally {
      busy.current = false;
    }
  }

  return (
    <form className="coverage" onSubmit={review}>
      <header className="page-intro">
        <p className="product-kicker">TSLAB · {symbol}</p>
        <h1>Buy coverage</h1>
        <p>
          {windowKind === "hour"
            ? "This release covers the next hour, starting one minute ago, so a cover can be settled today."
            : "The weekend window runs from Friday 16:00 ET to Monday 09:30 ET."}
          {" "}You pay the premium now.
          If the close print is below the open print by more than the gap you picked, the pool pays {symbol}.
          A smaller gap, a flat print, or a higher print pays nothing.
        </p>
      </header>

      <div className="split">
        <section className="product-card form-stack">
          <label className="product-field" htmlFor="coverage-notional">
            Notional ({symbol})
            <input
              id="coverage-notional"
              inputMode="decimal"
              value={notionalText}
              onChange={(event) => {
                setNotionalText(event.target.value);
                setConfirmedLarge(false);
                setNotice("");
              }}
            />
          </label>
          <ThresholdPicker
            value={quote?.tier.thresholdBps || thresholdBps}
            onChange={(bps) => {
              setThresholdBps(bps);
              setNotice("");
            }}
          />
          <fieldset className="window-choice">
            <legend>Coverage window</legend>
            <label>
              <input
                checked={windowKind === "weekend"}
                name="window"
                type="radio"
                onChange={() => setWindowChoice("weekend")}
              />
              <span>
                <strong>Weekend</strong>
                Friday 16:00 ET to Monday 09:30 ET
                <span>{formatWhen(weekend.start)} to {formatWhen(weekend.end)}</span>
              </span>
            </label>
            <label>
              <input
                checked={windowKind === "hour"}
                name="window"
                type="radio"
                onChange={() => setWindowChoice("hour")}
              />
              <span>
                <strong>One hour</strong>
                Starts one minute ago so a slow confirmation still fits
                <span>{formatWhen(hour.start)} to {formatWhen(hour.end)}</span>
              </span>
            </label>
          </fieldset>
          {large ? (
            <AmountWarning checked={confirmedLarge} onChange={setConfirmedLarge} symbol={symbol} />
          ) : null}
          {wallet.error ? <p className="product-alert" role="alert">{wallet.error}</p> : null}
          {notice ? <p className="product-status" role="status">{notice}</p> : null}
          <button className="product-primary" disabled={waiting} type="submit">
            {waiting ? "Waiting for wallet…" : "Review cover"}
          </button>
          <p className="product-hint">
            Review cover waits while the wallet confirms. It approves {symbol} if it needs to, then buys.
            Nothing moves until the wallet confirms.
          </p>
        </section>

        <aside className="product-card summary-card">
          <p className="product-kicker">Quote</p>
          <h2>{quote && !quote.tooSmall && notional != null ? `${formatUsdt(quote.premium)} ${symbol}` : "—"}</h2>
          <p>
            {quote && notional != null
              ? `${formatThreshold(quote.tier.premiumBps)} of ${formatUsdt(notional)} ${symbol}. That is the premium, paid up front if you buy.`
              : "Enter a notional to see the premium."}
          </p>
          <dl>
            <div>
              <dt>Window</dt>
              <dd>{chosen.label}</dd>
            </div>
            <div>
              <dt>Opens</dt>
              <dd>{formatWhen(chosen.start)}</dd>
            </div>
            <div>
              <dt>Closes</dt>
              <dd>{formatWhen(chosen.end)}</dd>
            </div>
            <div>
              <dt>Live TSLAB</dt>
              <dd>
                {quoteError === "MISSING_BINANCE_WEB3_KEYS"
                  ? "No price. The Binance Web3 keys are not set."
                  : liveTslab}
              </dd>
            </div>
            <div>
              <dt>Wallet</dt>
              <dd>{wallet.account ? (wallet.onBsc ? "Connected on BSC" : "Connected, wrong network") : "Not connected"}</dd>
            </div>
          </dl>

          <div className="what-if">
            <p className="product-kicker">What-if payout</p>
            <p>These two prices are an illustration, not a live print.</p>
            <label>
              Open print
              <input inputMode="decimal" value={referenceText} onChange={(event) => setReferenceText(event.target.value)} />
            </label>
            <label>
              Close print
              <input inputMode="decimal" value={settlementText} onChange={(event) => setSettlementText(event.target.value)} />
            </label>
            <p>
              {whatIf == null
                ? "Enter both prices to estimate a payout."
                : `Estimated payout ${formatUsdt(whatIf)} ${symbol}. A gap inside the threshold pays nothing.`}
            </p>
          </div>
        </aside>
      </div>
    </form>
  );
}

export default Coverage;
