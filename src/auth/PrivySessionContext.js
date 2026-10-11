import { createContext, useContext } from "react";

export const PrivySessionContext = createContext({
  enabled: false,
  ready: true,
  authenticated: false,
  account: null,
  address: "",
  userId: "",
  error: "",
  initGoogle: null,
  exportWallet: null,
  logout: null,
  noteLogin: null,
});

export function usePrivySession() {
  return useContext(PrivySessionContext);
}
