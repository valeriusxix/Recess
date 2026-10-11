import { useContext } from "react";
import { BscWalletContext } from "./BscWalletContext";

export function useBscWallet() {
  const value = useContext(BscWalletContext);
  if (!value) throw new Error("useBscWallet must be used within BscWalletProvider");
  return value;
}
