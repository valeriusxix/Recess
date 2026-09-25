import { useEffect, useState } from "react";
import { pythApiKey } from "../lib/cluster";
import { fetchHermesPrice, normalizeHermesPrice } from "../lib/pyth";

/** Latest TSLA price at 1e8, for the live gap display. Demo mode does not need it. */
export function useHermesPrice(enabled: boolean) {
  const [price, setPrice] = useState<bigint | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setPrice(null);
      setError("");
      return;
    }
    const key = pythApiKey();
    if (!key) {
      setPrice(null);
      setError("Set VITE_PYTH_API_KEY to show the live TSLA price.");
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const quote = await fetchHermesPrice(key);
        if (cancelled) return;
        if (!quote) {
          setError("Hermes did not return a TSLA price.");
          return;
        }
        setPrice(normalizeHermesPrice(quote.price, quote.exponent));
        setError("");
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Pyth price request failed.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return { price, error };
}
