import { useEffect, useState } from "react";
import AmountWarning from "../Components/AmountWarning";
import DemoAdminPanel from "../Components/DemoAdminPanel";
import { useBscWallet } from "../hooks/useBscWallet";
import { usePoolState } from "../hooks/usePoolState";
import { useSettlement } from "../hooks/useSettlement";
import { dollarToUsd8, formatUsdt, parseUsdt, ratioPercent } from "../lib/format";
import { HUNDRED_USDT } from "../lib/pricing";
import { approveUsdtIfNeeded, encodePool, fetchShares, txUrl } from "../lib/recess";

function Pool() {
  const wallet = useBscWallet();
  const poolState = usePoolState();
  const { selected } = useSettlement();
  const poolAddress = selected.poolAddress;
  const poolConfigured = Boolean(poolAddress);
  const symbol = selected.symbol;
  const [amountText, setAmountText] = useState("50");
  const [shareText, setShareText] = useState("");
  const [confirmedLarge, setConfirmedLarge] = useState(false);
  const [notice, setNotice] = useState("");
  const [loadedShares, setLoadedShares] = useState({ key: "", shares: null });
  const [referenceText, setReferenceText] = useState("200");
  const [settlementText, setSettlementText] = useState("170");
  const [demoNotice, setDemoNotice] = useState("");
  const amount = parseUsdt(amountText);
  const shareAmount = parseUsdt(shareText);
  const waiting = wallet.pending || wallet.sending;
  const pool = poolState.pool;
  const vault = poolState.vault;
  const book = pool?.accountedAssets ?? vault;
  const estimate = shareAmount != null && pool && book != null && pool.totalLpShares > 0n
    ? (shareAmount * book) / pool.totalLpShares
    : null;
  const largeDeposit = amount != null && amount > HUNDRED_USDT;
  const largeWithdraw = estimate != null && estimate > HUNDRED_USDT;

  const shareKey = wallet.account && poolConfigured && pool
    ? `${poolAddress}:${wallet.account}:${pool.totalLpShares}:${vault}`
    : "";

  useEffect(() => {
    if (!shareKey || !wallet.account) return undefined;
    let live = true;
    fetchShares(poolAddress, wallet.account)
      .then((value) => {
        if (live) setLoadedShares({ key: shareKey, shares: value });
      })
      .catch(() => {
        if (live) setLoadedShares({ key: shareKey, shares: null });
      });
    return () => {
      live = false;
    };
  }, [poolAddress, shareKey, wallet.account]);

  const shares = loadedShares.key === shareKey ? loadedShares.shares : null;

  async function deposit(event) {
    event.preventDefault();
    setNotice("");
    if (amount == null || amount === 0n) {
      setNotice(`Enter an amount of ${symbol}.`);
      return;
    }
    if (largeDeposit && !confirmedLarge) {
      setNotice(`Confirm the amount above 100 ${symbol} before depositing.`);
      return;
    }
    const owner = wallet.account && wallet.onBsc ? wallet.account : await wallet.connect();
    if (!owner) return;
    if (!poolConfigured) {
      setNotice(`Deposit of ${formatUsdt(amount)} ${symbol} was not sent. Add ${selected.envName} before liquidity can move.`);
      return;
    }
    const approval = await approveUsdtIfNeeded({
      token: selected.tokenAddress,
      owner,
      spender: poolAddress,
      amount,
      send: wallet.sendTransaction,
    });
    if (!approval.ok) {
      setNotice(approval.error || "The deposit was not sent.");
      return;
    }
    const result = await wallet.sendTransaction({
      to: poolAddress,
      data: encodePool("depositLiquidity", [amount]),
    });
    if (!result) {
      setNotice("The deposit was not sent.");
      return;
    }
    const warning = [...approval.warnings, result.warning].filter(Boolean).join(" ");
    setNotice(`Deposit sent. ${txUrl(result.hash)}${warning ? ` ${warning}` : ""}`);
    await poolState.refresh();
  }

  async function withdraw() {
    setNotice("");
    if (shareAmount == null || shareAmount === 0n) {
      setNotice(`Enter the number of shares to withdraw. Shares are not the same as ${symbol}.`);
      return;
    }
    if (largeWithdraw && !confirmedLarge) {
      setNotice(`Confirm the withdrawal above 100 ${symbol} before continuing.`);
      return;
    }
    const owner = wallet.account && wallet.onBsc ? wallet.account : await wallet.connect();
    if (!owner) return;
    if (!poolConfigured) {
      setNotice(`Withdrawal was not sent. Add ${selected.envName} before liquidity can move.`);
      return;
    }
    if (shares != null && shareAmount > shares) {
      setNotice("That is more shares than this wallet holds. Nothing was sent.");
      return;
    }
    if (
      pool && book != null && estimate != null
      && (estimate > book || book - estimate < pool.outstandingNotional)
    ) {
      setNotice("That withdrawal would leave the vault below cover that is still outstanding. Nothing was sent.");
      return;
    }
    const result = await wallet.sendTransaction({
      to: poolAddress,
      data: encodePool("withdrawLiquidity", [shareAmount]),
    });
    if (!result) {
      setNotice("The withdrawal was not sent.");
      return;
    }
    setNotice(`Withdrawal sent. ${txUrl(result.hash)}${result.warning ? ` ${result.warning}` : ""}`);
    await poolState.refresh();
  }

  async function setDemoPrices(event) {
    event.preventDefault();
    setDemoNotice("");
    const reference = dollarToUsd8(referenceText);
    const settlement = dollarToUsd8(settlementText);
    if (reference == null || settlement == null || reference === 0n || settlement === 0n) {
      setDemoNotice("Enter both demo prices in dollars. Nothing was sent.");
      return;
    }
    const owner = wallet.account && wallet.onBsc ? wallet.account : await wallet.connect();
    if (!owner) return;
    if (!pool || owner.toLowerCase() !== pool.authority.toLowerCase()) {
      setDemoNotice("This wallet is not the pool authority. Nothing was sent.");
      return;
    }
    const result = await wallet.sendTransaction({
      to: poolAddress,
      data: encodePool("setDemoPrices", [reference, settlement]),
    });
    if (!result) {
      setDemoNotice("Demo prices were not sent.");
      return;
    }
    setDemoNotice(`Demo prices sent. ${txUrl(result.hash)}${result.warning ? ` ${result.warning}` : ""}`);
    await poolState.refresh();
  }

  const canSendDemo = Boolean(
    wallet.account && pool?.authority && wallet.account.toLowerCase() === pool.authority.toLowerCase(),
  );

  return (
    <section className="stack-page">
      <header className="page-intro">
        <p className="product-kicker">{symbol} liquidity</p>
        <h1>Pool</h1>
        <p>
          Liquidity providers deposit {symbol} so covers can pay out. A withdrawal burns shares, not a {symbol} amount,
          and it cannot leave the vault below cover that is still outstanding.
        </p>
      </header>
      <div className="split">
        <form className="product-card form-stack" onSubmit={deposit}>
          <label className="product-field" htmlFor="pool-amount">
            Deposit amount ({symbol})
            <input
              id="pool-amount"
              inputMode="decimal"
              value={amountText}
              onChange={(event) => {
                setAmountText(event.target.value);
                setConfirmedLarge(false);
              }}
            />
          </label>
          <label className="product-field" htmlFor="pool-shares">
            Shares to withdraw
            <input
              id="pool-shares"
              inputMode="decimal"
              placeholder={shares == null ? "0.00" : formatUsdt(shares)}
              value={shareText}
              onChange={(event) => {
                setShareText(event.target.value);
                setConfirmedLarge(false);
              }}
            />
          </label>
          <p className="product-hint">
            The first deposit mints one share per {symbol} unit. Later deposits follow the vault, so withdrawing
            {shareText.trim() ? ` ${shareText.trim()} shares` : " shares"}
            {estimate == null ? ` pays ${symbol} in proportion to the vault.` : ` would return about ${formatUsdt(estimate)} ${symbol}.`}
            {shares == null ? "" : ` This wallet holds ${formatUsdt(shares)} shares.`}
          </p>
          {largeDeposit || largeWithdraw ? (
            <AmountWarning checked={confirmedLarge} onChange={setConfirmedLarge} symbol={symbol} />
          ) : null}
          {wallet.error ? <p className="product-alert" role="alert">{wallet.error}</p> : null}
          {notice ? <p className="product-status" role="status">{notice}</p> : null}
          <div className="button-row">
            <button className="product-primary" disabled={waiting} type="submit">
              {waiting ? "Waiting for wallet…" : "Deposit"}
            </button>
            <button className="product-secondary" disabled={waiting} type="button" onClick={withdraw}>
              Withdraw shares
            </button>
          </div>
          <p className="product-hint">The button waits while the wallet confirms. Nothing moves until then.</p>
        </form>
        <article className="product-card">
          <h2>How the figures are read</h2>
          {poolState.loading && !pool ? <p>Reading the pool…</p> : null}
          {poolState.error ? <p className="product-alert" role="alert">{poolState.error}</p> : null}
          {!poolConfigured ? <p className="product-note">Vault totals appear here once {selected.envName} is set.</p> : null}
          <dl className="stat-list">
            <div>
              <dt>Vault</dt>
              <dd>{vault == null ? "—" : `${formatUsdt(vault)} ${symbol}`}</dd>
            </div>
            <div>
              <dt>Outstanding cover</dt>
              <dd>{pool ? `${formatUsdt(pool.outstandingNotional)} ${symbol}` : "—"}</dd>
            </div>
            <div>
              <dt>Utilization</dt>
              <dd>
                {pool && vault != null ? ratioPercent(pool.outstandingNotional, vault) : "—"}
                <span className="product-hint"> Outstanding cover divided by the {symbol} in the vault.</span>
              </dd>
            </div>
            <div>
              <dt>Yield label</dt>
              <dd>
                {pool && vault != null ? ratioPercent(pool.premiumsCollected * 52n, vault) : "—"}
                <span className="product-hint"> Premiums divided by the vault, times 52. That repeats one weekend. It is not a forecast.</span>
              </dd>
            </div>
            <div>
              <dt>Your shares</dt>
              <dd>{shares == null ? "—" : formatUsdt(shares)}</dd>
            </div>
            <div>
              <dt>Settlement token</dt>
              <dd>{symbol} · {selected.tokenAddress}</dd>
            </div>
          </dl>
        </article>
      </div>
      {pool?.demoMode ? (
        <DemoAdminPanel
          canSend={canSendDemo}
          notice={demoNotice}
          pending={waiting}
          referenceText={referenceText}
          settlementText={settlementText}
          onReference={setReferenceText}
          onSettlement={setSettlementText}
          onSubmit={setDemoPrices}
        />
      ) : null}
    </section>
  );
}

export default Pool;
