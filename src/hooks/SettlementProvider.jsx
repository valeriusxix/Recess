import { useCallback, useMemo, useState } from "react";
import { settlementById, SETTLEMENTS } from "../lib/settlements";
import { SettlementContext } from "./SettlementContext";

const STORAGE_KEY = "recess.settlement";

function readChoice() {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored === "usdc" ? "usdc" : "usdt";
  } catch {
    return "usdt";
  }
}

export function SettlementProvider({ children }) {
  const [id, setId] = useState(readChoice);
  const selected = settlementById(id);

  const choose = useCallback((next) => {
    const choice = next === "usdc" ? "usdc" : "usdt";
    setId(choice);
    try {
      sessionStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // The choice still applies to this page load.
    }
  }, []);

  const value = useMemo(() => ({
    options: SETTLEMENTS,
    selected,
    choose,
  }), [choose, selected]);

  return <SettlementContext.Provider value={value}>{children}</SettlementContext.Provider>;
}
