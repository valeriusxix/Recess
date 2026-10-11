import { useEffect, useState } from "react";
import { shortAddress } from "../auth/wallet";
import DemoAdminPanel from "../Components/DemoAdminPanel";
import PolicyCard from "../Components/PolicyCard";
import { useBscWallet } from "../hooks/useBscWallet";
import { usePoolState } from "../hooks/usePoolState";
import { useSettlement } from "../hooks/useSettlement";
import { dollarToUsd8, formatThreshold, formatUsd8 } from "../lib/format";
import { gapBps } from "../lib/pricing";
import { encodePool, fetchPolicies, txUrl } from "../lib/recess";


function gapText(policy, pool) {
  if (!pool) return "Pool prints are not loaded.";
  let reference;
  let settlement;
  let source;
  if (pool.demoMode && pool.demoReferencePrice > 0n && pool.demoSettlementPrice > 0n) {
    reference = pool.demoReferencePrice;
    settlement = pool.demoSettlementPrice;
    source = "Demo prints";
  } else if (pool.windowStartPosted && pool.windowEndPosted && pool.postedReferencePrice > 0n) {
    reference = pool.postedReferencePrice;
    settlement = pool.postedSettlementPrice;
    source = "Posted prints";
  } else if (policy.status !== 0 && policy.referencePrice > 0n) {
    return `Settled from an open print of ${formatUsd8(policy.referencePrice)}. Payout is the figure below.`;
  } else {
    return "Prints are not posted yet, so the gap is blank.";
  }
  const gap = gapBps(reference, settlement);
  const inside = gap <= BigInt(policy.thresholdBps);
  return `${source}: ${formatUsd8(reference)} to ${formatUsd8(settlement)}, a ${formatThreshold(Number(gap))} gap against ${formatThreshold(policy.thresholdBps)}. ${inside ? "That gap pays nothing." : "That gap is past the threshold."}`;
}

function Dashboard() {
  const wallet = useBscWallet();
  const { account, onBsc, pending, sending, error, connect, sendTransaction } = wallet;
  const poolState = usePoolState();
  const { selected } = useSettlement();
  const poolAddress = selected.poolAddress;
  const poolConfigured = Boolean(poolAddress);
  const symbol = selected.symbol;
  const [loaded, setLoaded] = useState({ key: "", policies: null, error: "", nowSeconds: 0 });
  const [notice, setNotice] = useState("");
  const [referenceText, setReferenceText] = useState("200");
  const [settlementText, setSettlementText] = useState("170");
  const [demoNotice, setDemoNotice] = useState("");

  const policyKey = account && onBsc && poolConfigured && poolState.pool
    ? `${account}:${poolAddress}:${poolState.pool.policyCount}:${poolState.pool.demoReferencePrice}:${poolState.pool.demoSettlementPrice}`
    : "";

  useEffect(() => {
    if (!policyKey) return undefined;
    let live = true;
    fetchPolicies(poolAddress, account)
      .then((rows) => {
        if (!live) return;
        setLoaded({
          key: policyKey,
          policies: rows,
          error: "",
          nowSeconds: Math.floor(Date.now() / 1000),
        });
      })
      .catch((err) => {
        if (!live) return;
        setLoaded({
          key: policyKey,
          policies: [],
          error: String(err?.message || "Policies could not be read."),
          nowSeconds: Math.floor(Date.now() / 1000),
        });
      });
    return () => {
      live = false;
    };
  }, [account, policyKey, poolAddress]);

  const waiting = pending || sending;
  const authority = poolState.pool?.authority || "";
  const canSendDemo = Boolean(account && authority && account.toLowerCase() === authority.toLowerCase());

  async function claim(policy) {
    setNotice("");
    const connected = account && onBsc ? true : await connect();
    if (!connected) return;
    const result = await sendTransaction({
      to: poolAddress,
      data: encodePool("settlePolicy", [policy.id]),
    });
    if (!result) {
      setNotice("The claim was not sent.");
      return;
    }
    setNotice(`Claim sent. ${txUrl(result.hash)}${result.warning ? ` ${result.warning}` : ""}`);
    const refreshed = await poolState.refresh();
    const rows = await fetchPolicies(poolAddress, account).catch(() => null);
    if (rows) {
      const nextKey = refreshed?.pool
        ? `${account}:${refreshed.pool.policyCount}:${refreshed.pool.demoReferencePrice}:${refreshed.pool.demoSettlementPrice}`
        : policyKey;
      setLoaded({
        key: nextKey,
        policies: rows,
        error: "",
        nowSeconds: loaded.nowSeconds,
      });
    }
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
    const owner = account && onBsc ? account : await connect();
    if (!owner) return;
    if (owner.toLowerCase() !== poolState.pool.authority.toLowerCase()) {
      setDemoNotice("This wallet is not the pool authority. Nothing was sent.");
      return;
    }
    const result = await sendTransaction({
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

  const policies = loaded.key === policyKey ? loaded.policies : null;
  const loadError = loaded.key === policyKey ? loaded.error : "";
  const nowSeconds = loaded.nowSeconds;

  return (
    <section className="stack-page">
      <header className="page-intro">
        <p className="product-kicker">Your policies</p>
        <h1>Dashboard</h1>
        <p>
          {poolState.pool?.demoMode === false
            ? `Policies belong to the wallet that buys them. A claim pays that wallet in ${symbol} after the window closes.`
            : `Policies belong to the wallet that buys them. A claim pays that wallet in ${symbol}. In this demo release the claim can be sent once the authority has set both prints.`}
        </p>
      </header>

      {!account ? (
        <article className="product-card empty-state">
          <p>Connect the wallet that will own the cover. Nothing is listed until that wallet is connected.</p>
          <a className="product-primary" href="/coverage">Price a cover</a>
        </article>
      ) : !onBsc ? (
        <article className="product-card empty-state">
          <p>{shortAddress(account)} is connected on another network. Switch to BNB Smart Chain to read policies.</p>
          <a className="product-primary" href="/coverage">Price a cover</a>
        </article>
      ) : !poolConfigured ? (
        <article className="product-card empty-state">
          <p>
            {shortAddress(account)} is on BNB Smart Chain. Add {selected.envName} before {symbol} policies can be read.
            No cover has been purchased from this page.
          </p>
          <a className="product-primary" href="/coverage">Price a cover</a>
        </article>
      ) : poolState.loading && !poolState.pool ? (
        <article className="product-card"><p>Reading the pool…</p></article>
      ) : poolState.error ? (
        <article className="product-card"><p className="product-alert" role="alert">{poolState.error}</p></article>
      ) : (
        <div className="policy-list">
          {error ? <p className="product-alert" role="alert">{error}</p> : null}
          {notice ? <p className="product-status" role="status">{notice}</p> : null}
          {loadError ? <p className="product-alert" role="alert">{loadError}</p> : null}
          {policies == null ? <article className="product-card"><p>Reading policies…</p></article> : null}
          {policies?.length === 0 ? (
            <article className="product-card empty-state">
              <p>{shortAddress(account)} has no covers in this pool.</p>
              <a className="product-primary" href="/coverage">Price a cover</a>
            </article>
          ) : null}
          {policies?.map((policy) => {
            const windowOpen = nowSeconds < Number(policy.coverageEndTs);
            const demoReady = poolState.pool.demoMode
              && poolState.pool.demoReferencePrice > 0n
              && poolState.pool.demoSettlementPrice > 0n;
            const claimable = poolState.pool.demoMode ? demoReady : !windowOpen;
            let claimLabel = "Claim";
            if (waiting) claimLabel = "Waiting for wallet…";
            else if (poolState.pool.demoMode && !demoReady) claimLabel = "Set demo prices first";
            else if (!poolState.pool.demoMode && windowOpen) claimLabel = "Window still open";
            return (
              <PolicyCard
                claimDisabled={waiting || !claimable}
                claimLabel={claimLabel}
                gapText={gapText(policy, poolState.pool)}
                key={policy.id.toString()}
                policy={policy}
                symbol={symbol}
                onClaim={() => claim(policy)}
              />
            );
          })}
          {poolState.pool.demoMode ? (
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
        </div>
      )}
    </section>
  );
}

export default Dashboard;
