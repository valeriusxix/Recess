import { useContext } from "react";
import { SettlementContext } from "./SettlementContext";

export function useSettlement() {
  const value = useContext(SettlementContext);
  if (!value) throw new Error("useSettlement must be used within SettlementProvider");
  return value;
}
