import { useEffect, useRef, useState } from "react";
import { useBscWallet } from "../hooks/useBscWallet";
import { usePoolState } from "../hooks/usePoolState";
import { blockTimestamp, latestBlockNumber } from "../lib/ethCall";
import {
  accountActivityStartBlock,
  fetchAccountActivity,
  fetchPolicies,
  fetchShares,
} from "../lib/recess";
import { formatThreshold, formatUsdt, formatWhen } from "../lib/format";
import { useSettlement } from "../hooks/useSettlement";

const POLL_INTERVAL_MS = 30_000;

async function addTimestamps(rows) {
  const timestamps = new Map();
  const blocks = [...new Set(rows.map((row) => row.blockNumber.toString()))];
  let next = 0;

  async function worker() {
    while (next < blocks.length) {
      const block = blocks[next];
      next += 1;
      timestamps.set(block, await blockTimestamp(BigInt(block)));
    }
  }

  await Promise.all(Array.from({ length: Math.min(5, blocks.length) }, worker));
  return rows.map((row) => ({
    ...row,
    timestamp: timestamps.get(row.blockNumber.toString()),
  }));
}

function notificationText(event, symbol) {
  if (event.type === "deposit") return `${formatUsdt(event.amount)} ${symbol} deposited.`;
  if (event.type === "withdrawal") return `${formatUsdt(event.amount)} ${symbol} withdrawn.`;
  if (event.type === "position-opened") return `Position #${event.policyId} opened.`;
  return `${formatUsdt(event.amount)} ${symbol} payout received for position #${event.policyId}.`;
}

function activityTitle(event) {
  if (event.type === "deposit") return "Liquidity deposited";
  if (event.type === "withdrawal") return "Liquidity withdrawn";
  if (event.type === "position-opened") return `Position #${event.policyId} opened`;
  return `Payout · position #${event.policyId}`;
}

function Portfolio() {
  const wallet = useBscWallet();
  const poolState = usePoolState();
  const { selected } = useSettlement();
  const poolAddress = selected.poolAddress;
  const poolConfigured = Boolean(poolAddress);
  const [snapshot, setSnapshot] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const refreshLock = useRef(false);
  const accountKey = wallet.account && wallet.onBsc && poolConfigured
    ? `${poolAddress.toLowerCase()}:${wallet.account.toLowerCase()}`
    : "";
  const activeSnapshot = snapshot?.account === accountKey ? snapshot : null;

  useEffect(() => {
    if (!accountKey) return undefined;
    let live = true;
    let cursor = null;
    refreshLock.current = false;

    async function loadPortfolio() {
      const startBlock = accountActivityStartBlock();
      const [latest, policies, shares] = await Promise.all([
        latestBlockNumber(),
        fetchPolicies(poolAddress, wallet.account),
        fetchShares(poolAddress, wallet.account),
      ]);
      const activity = await fetchAccountActivity(poolAddress, wallet.account, startBlock, latest);
      const datedActivity = await addTimestamps(activity);
      if (!live) return;
      cursor = latest;
      setSnapshot({
        account: accountKey,
        activity: datedActivity.reverse(),
        notifications: [],
        policies,
        shares,
        latestBlock: latest,
        error: "",
        loading: false,
        loaded: true,
      });
    }

    async function pollPortfolio() {
      if (refreshLock.current || cursor == null) return;
      refreshLock.current = true;
      try {
        const latest = await latestBlockNumber();
        const [policies, shares] = await Promise.all([
          fetchPolicies(poolAddress, wallet.account),
          fetchShares(poolAddress, wallet.account),
        ]);
        let newActivity = [];
        if (latest > cursor) {
          newActivity = await fetchAccountActivity(poolAddress, wallet.account, cursor + 1n, latest);
          newActivity = await addTimestamps(newActivity);
        }
        if (!live) return;
        cursor = latest;
        setSnapshot((current) => {
          if (!current || current.account !== accountKey) return current;
          const notifications = newActivity.map((event) => ({
            id: event.id,
            text: notificationText(event, selected.symbol),
            timestamp: event.timestamp,
          }));
          return {
            ...current,
            activity: [...newActivity.slice().reverse(), ...current.activity],
            notifications: [...notifications, ...current.notifications].slice(0, 25),
            policies,
            shares,
            latestBlock: latest,
            error: "",
            loaded: true,
          };
        });
      } catch (error) {
        if (live) {
          setSnapshot((current) => current?.account === accountKey
            ? { ...current, error: error instanceof Error ? error.message : "Portfolio refresh failed." }
            : current);
        }
      } finally {
        refreshLock.current = false;
      }
    }

    loadPortfolio().catch((error) => {
      if (!live) return;
      setSnapshot({
        account: accountKey,
        activity: [],
        notifications: [],
        policies: [],
        shares: null,
        latestBlock: null,
        error: error instanceof Error ? error.message : "The portfolio could not be loaded.",
        loading: false,
        loaded: false,
      });
    });

    const interval = window.setInterval(pollPortfolio, POLL_INTERVAL_MS);
    return () => {
      live = false;
      window.clearInterval(interval);
    };
  }, [accountKey, poolAddress, selected.symbol, wallet.account]);

  const activity = activeSnapshot?.activity || [];
  const policies = activeSnapshot?.policies || [];
  const openPolicies = policies.filter((policy) => policy.status === 0);
  const sumAmount = (type) => activity
    .filter((event) => event.type === type)
    .reduce((sum, event) => sum + event.amount, 0n);
  const deposited = sumAmount("deposit");
  const withdrawn = sumAmount("withdrawal");
  const premiums = sumAmount("position-opened");
  const payouts = sumAmount("payout");
  const shareValue = activeSnapshot?.shares != null
    && poolState.pool?.totalLpShares > 0n
    && poolState.pool?.accountedAssets != null
    ? activeSnapshot.shares * poolState.pool.accountedAssets / poolState.pool.totalLpShares
    : null;

  async function connectWallet() {
    setConnecting(true);
    try {
      await wallet.connect();
    } finally {
      setConnecting(false);
    }
  }

  return (
    <section className="stack-page portfolio-page">
      <header className="page-intro">
        <p className="product-kicker">Wallet activity</p>
        <h1>Portfolio</h1>
        <p>Open coverage positions and confirmed pool activity for the connected BNB Smart Chain wallet.</p>
      </header>

      {!poolConfigured ? (
        <article className="product-card">
          <p className="product-alert" role="alert">
            Portfolio history is unavailable because the {selected.symbol} pool is not configured.
          </p>
        </article>
      ) : !wallet.account ? (
        <article className="product-card empty-state">
          <p>Connect the wallet used for your Recess transactions to view its positions and history.</p>
          <button className="product-primary" disabled={connecting || wallet.pending} type="button" onClick={connectWallet}>
            {connecting || wallet.pending ? "Connecting…" : "Connect wallet"}
          </button>
        </article>
      ) : !wallet.onBsc ? (
        <article className="product-card empty-state">
          <p>Switch the connected wallet to BNB Smart Chain to read its portfolio.</p>
          <button className="product-primary" disabled={connecting || wallet.pending} type="button" onClick={connectWallet}>
            {connecting || wallet.pending ? "Switching…" : "Switch to BNB Smart Chain"}
          </button>
        </article>
      ) : (
        <>
          {wallet.error ? <p className="product-alert" role="alert">{wallet.error}</p> : null}
          {activeSnapshot?.error && !activeSnapshot.loaded ? (
            <article className="product-card">
              <p className="product-alert" role="alert">{activeSnapshot.error}</p>
            </article>
          ) : null}
          {!activeSnapshot ? (
            <article className="product-card"><p>Loading wallet history from BNB Smart Chain…</p></article>
          ) : activeSnapshot.loaded ? (
            <>
          {activeSnapshot?.error ? <p className="product-alert" role="alert">{activeSnapshot.error}</p> : null}
              {activeSnapshot.notifications.length > 0 ? (
                <section aria-label="New portfolio notifications" aria-live="polite" className="portfolio-notifications">
                  {activeSnapshot.notifications.map((notification) => (
                    <p className="product-status" key={notification.id} role="status">
                      {notification.timestamp ? `${formatWhen(new Date(notification.timestamp * 1000))} · ` : ""}
                      {notification.text}
                    </p>
                  ))}
                </section>
              ) : null}

              <section aria-label="Portfolio totals" className="portfolio-stats">
                <article className="product-card">
                  <span>Open positions</span>
                  <strong>{openPolicies.length}</strong>
                </article>
                <article className="product-card">
                  <span>Liquidity shares</span>
                  <strong>{activeSnapshot.shares == null ? "—" : formatUsdt(activeSnapshot.shares)}</strong>
                  {shareValue != null ? <small>Approx. {formatUsdt(shareValue)} {selected.symbol} value</small> : null}
                </article>
                <article className="product-card">
                  <span>Total deposited</span>
                  <strong>{formatUsdt(deposited)} {selected.symbol}</strong>
                </article>
                <article className="product-card">
                  <span>Total withdrawn</span>
                  <strong>{formatUsdt(withdrawn)} {selected.symbol}</strong>
                </article>
                <article className="product-card">
                  <span>Premiums paid</span>
                  <strong>{formatUsdt(premiums)} {selected.symbol}</strong>
                </article>
                <article className="product-card">
                  <span>Payouts received</span>
                  <strong>{formatUsdt(payouts)} {selected.symbol}</strong>
                </article>
              </section>

              <section className="portfolio-section">
                <header>
                  <h2>Open positions</h2>
                  <a className="text-action" href="/coverage">Buy coverage</a>
                </header>
                {openPolicies.length === 0 ? (
                  <article className="product-card empty-state"><p>No open positions for this wallet.</p></article>
                ) : (
                  <div className="portfolio-position-list">
                    {openPolicies.map((policy) => (
                      <article className="product-card portfolio-position" key={policy.id.toString()}>
                        <div>
                          <h3>Position #{policy.id.toString()}</h3>
                          <p>{formatUsdt(policy.notional)} {selected.symbol} notional · {formatThreshold(policy.thresholdBps)} threshold</p>
                        </div>
                        <dl>
                          <div><dt>Premium paid</dt><dd>{formatUsdt(policy.premiumPaid)} {selected.symbol}</dd></div>
                          <div><dt>Coverage ends</dt><dd>{formatWhen(new Date(Number(policy.coverageEndTs) * 1000))}</dd></div>
                        </dl>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="portfolio-section">
                <header>
                  <h2>Activity history</h2>
                  <span>{activity.length} records</span>
                </header>
                {activity.length === 0 ? (
                  <article className="product-card empty-state"><p>No deposits, withdrawals, positions, or payouts found for this wallet.</p></article>
                ) : (
                  <div className="portfolio-activity-list">
                    {activity.map((event) => (
                      <article className="product-card portfolio-activity" key={event.id}>
                        <div>
                          <h3>{activityTitle(event)}</h3>
                          <p>{event.timestamp ? formatWhen(new Date(event.timestamp * 1000)) : "Time unavailable"}</p>
                          {event.type === "position-opened" ? (
                            <p>{formatUsdt(event.notional)} {selected.symbol} notional · {formatThreshold(event.thresholdBps)} threshold</p>
                          ) : null}
                        </div>
                        <strong>{formatUsdt(event.amount)} {selected.symbol}</strong>
                        <a href={`https://bscscan.com/tx/${event.transactionHash}`} rel="noreferrer" target="_blank">
                          View transaction
                        </a>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

export default Portfolio;
