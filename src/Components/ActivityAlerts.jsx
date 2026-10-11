import { useEffect, useRef, useState } from "react";
import { useBscWallet } from "../hooks/useBscWallet";
import { latestBlockNumber } from "../lib/ethCall";
import { fetchAccountActivity } from "../lib/recess";
import { formatUsdt } from "../lib/format";
import { useSettlement } from "../hooks/useSettlement";

const POLL_INTERVAL_MS = 30_000;
const ALERT_DURATION_MS = 8_000;

function alertText(event, symbol) {
  if (event.type === "deposit") return `${formatUsdt(event.amount)} ${symbol} deposited.`;
  if (event.type === "withdrawal") return `${formatUsdt(event.amount)} ${symbol} withdrawn.`;
  if (event.type === "position-opened") return `Position #${event.policyId} opened.`;
  return `${formatUsdt(event.amount)} ${symbol} payout received for position #${event.policyId}.`;
}

function cursorKey(poolAddress, account) {
  return `recess.activity.cursor:${poolAddress.toLowerCase()}:${account}`;
}

function readCursor(key) {
  try {
    const stored = localStorage.getItem(key);
    if (stored == null) return { block: null, warning: "" };
    if (!/^\d+$/.test(stored)) {
      return { block: null, warning: "The saved activity cursor was invalid; notifications will start from now." };
    }
    return { block: BigInt(stored), warning: "" };
  } catch {
    return { block: null, warning: "Browser storage is unavailable; notifications may reset after navigation." };
  }
}

function saveCursor(key, block) {
  try {
    localStorage.setItem(key, block.toString());
    return true;
  } catch {
    return false;
  }
}

function ActivityAlerts() {
  const { account, onBsc } = useBscWallet();
  const { selected } = useSettlement();
  const poolAddress = selected.poolAddress;
  const poolConfigured = Boolean(poolAddress);
  const [monitor, setMonitor] = useState({ account: "", alerts: [], error: "" });
  const sequence = useRef(0);
  const activeAccount = account && onBsc && poolConfigured
    ? `${poolAddress.toLowerCase()}:${account.toLowerCase()}`
    : "";
  const activeMonitor = monitor.account === activeAccount ? monitor : null;

  useEffect(() => {
    if (!activeAccount) return undefined;
    let live = true;
    let cursor = null;
    let polling = false;
    const timeouts = [];
    const storageKey = cursorKey(poolAddress, account);
    const storedCursor = readCursor(storageKey);

    async function poll() {
      if (polling || cursor == null) return;
      polling = true;
      try {
        const latest = await latestBlockNumber();
        if (!live) return;
        const activity = latest > cursor
          ? await fetchAccountActivity(poolAddress, account, cursor + 1n, latest)
          : [];
        if (!live) return;
        cursor = latest;
        const saved = saveCursor(storageKey, latest);
        const nextAlerts = activity.map((event) => ({
          id: `${activeAccount}:${event.id}:${sequence.current++}`,
          text: alertText(event, selected.symbol),
        }));
        setMonitor((current) => ({
          account: activeAccount,
          alerts: [...nextAlerts, ...(current.account === activeAccount ? current.alerts : [])].slice(0, 4),
          error: saved ? "" : "Browser storage is unavailable; notifications may reset after navigation.",
        }));
        nextAlerts.forEach((alert) => {
          timeouts.push(window.setTimeout(() => {
            if (!live) return;
            setMonitor((current) => current.account === activeAccount
              ? { ...current, alerts: current.alerts.filter((item) => item.id !== alert.id) }
              : current);
          }, ALERT_DURATION_MS));
        });
      } catch (err) {
        if (live) {
          setMonitor((current) => ({
            account: activeAccount,
            alerts: current.account === activeAccount ? current.alerts : [],
            error: err instanceof Error ? err.message : "Wallet activity notifications could not be refreshed.",
          }));
        }
      } finally {
        polling = false;
      }
    }

    latestBlockNumber().then((latest) => {
      if (!live) return;
      const startBlock = storedCursor.block == null || storedCursor.block > latest
        ? latest
        : storedCursor.block;
      cursor = startBlock;
      const baselineSaved = storedCursor.block != null && storedCursor.block <= latest
        ? true
        : saveCursor(storageKey, latest);
      setMonitor({
        account: activeAccount,
        alerts: [],
        error: baselineSaved ? "" : storedCursor.warning || "Browser storage is unavailable; notifications may reset after navigation.",
      });
      if (storedCursor.block != null && storedCursor.block <= latest) poll();
    }).catch((err) => {
      if (live) {
        setMonitor({
          account: activeAccount,
          alerts: [],
          error: err instanceof Error ? err.message : "Wallet activity notifications could not be started.",
        });
      }
    });
    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      live = false;
      window.clearInterval(interval);
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, [account, activeAccount, poolAddress, selected.symbol]);

  if (!activeAccount || (!activeMonitor?.alerts.length && !activeMonitor?.error)) return null;

  return (
    <div aria-live="polite" className="activity-alert-stack">
      {activeMonitor.error ? <p className="activity-alert-error" role="alert">{activeMonitor.error}</p> : null}
      {activeMonitor.alerts.map((alert) => (
        <p className="activity-alert" key={alert.id} role="status">
          {alert.text}
          <button
            aria-label="Dismiss notification"
            type="button"
            onClick={() => setMonitor((current) => current.account === activeAccount
              ? { ...current, alerts: current.alerts.filter((item) => item.id !== alert.id) }
              : current)}
          >
            ×
          </button>
        </p>
      ))}
    </div>
  );
}

export default ActivityAlerts;
