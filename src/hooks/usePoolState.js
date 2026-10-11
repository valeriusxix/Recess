import { useContext } from "react";
import { PoolStateContext } from "./PoolStateContext";

export function usePoolState() {
  const value = useContext(PoolStateContext);
  if (!value) throw new Error("usePoolState must be used within PoolStateProvider");
  return value;
}
