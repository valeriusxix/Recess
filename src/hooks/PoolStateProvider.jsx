import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchPoolState } from "../lib/recess";
import { useSettlement } from "./useSettlement";
import { PoolStateContext } from "./PoolStateContext";

const EMPTY = {
  forPool: "",
  pool: null,
  vault: null,
  error: "",
  loading: false,
};

export function PoolStateProvider({ children }) {
  const { selected } = useSettlement();
  const [state, setState] = useState(EMPTY);
  const liveRef = useRef(true);
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const apply = useCallback((address, next) => {
    if (!liveRef.current) return null;
    if (selectedRef.current.poolAddress.toLowerCase() !== address.toLowerCase()) return null;
    setState(next);
    return next;
  }, []);

  const refresh = useCallback(async () => {
    const current = selectedRef.current;
    if (!current.poolAddress) return null;
    const address = current.poolAddress;
    try {
      const next = await fetchPoolState(address);
      if (next.pool.usdt.toLowerCase() !== current.tokenAddress.toLowerCase()) {
        throw new Error(`This pool does not settle in ${current.symbol}. Nothing was shown.`);
      }
      return apply(address, {
        forPool: address.toLowerCase(),
        pool: next.pool,
        vault: next.vault,
        error: "",
        loading: false,
      });
    } catch (error) {
      return apply(address, {
        forPool: address.toLowerCase(),
        pool: null,
        vault: null,
        error: String(error?.message || "The pool could not be read."),
        loading: false,
      });
    }
  }, [apply]);

  useEffect(() => {
    liveRef.current = true;
    const address = selected.poolAddress;
    if (!address) return () => {
      liveRef.current = false;
    };
    let live = true;
    fetchPoolState(address)
      .then((next) => {
        if (!live) return;
        if (next.pool.usdt.toLowerCase() !== selected.tokenAddress.toLowerCase()) {
          throw new Error(`This pool does not settle in ${selected.symbol}. Nothing was shown.`);
        }
        setState({
          forPool: address.toLowerCase(),
          pool: next.pool,
          vault: next.vault,
          error: "",
          loading: false,
        });
      })
      .catch((error) => {
        if (!live) return;
        setState({
          forPool: address.toLowerCase(),
          pool: null,
          vault: null,
          error: String(error?.message || "The pool could not be read."),
          loading: false,
        });
      });
    return () => {
      live = false;
      liveRef.current = false;
    };
  }, [selected.poolAddress, selected.symbol, selected.tokenAddress]);

  const address = selected.poolAddress.toLowerCase();
  const matches = Boolean(address) && state.forPool === address;
  const value = useMemo(() => ({
    configured: Boolean(selected.poolAddress),
    pool: matches ? state.pool : null,
    vault: matches ? state.vault : null,
    error: matches ? state.error : "",
    loading: Boolean(selected.poolAddress) && !matches,
    refresh,
    symbol: selected.symbol,
  }), [matches, refresh, selected.poolAddress, selected.symbol, state.error, state.pool, state.vault]);

  return <PoolStateContext.Provider value={value}>{children}</PoolStateContext.Provider>;
}
