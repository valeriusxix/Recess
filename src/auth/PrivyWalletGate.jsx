import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCreateWallet, useExportWallet, useLoginWithOAuth, usePrivy } from "@privy-io/react-auth";
import { ensureEmbeddedWallet, findEmbeddedWallet, isEmailOrGoogleUser } from "./embeddedWallet";
import { PrivySessionContext } from "./PrivySessionContext";

function accountFromPrivy(user) {
  const google = user.linkedAccounts?.find((account) => account.type === "google_oauth");
  const email = user.email?.address || google?.email || "";
  const name = google?.name || email || "Account";
  return {
    id: user.id,
    name,
    email,
    method: google ? "google" : "email",
  };
}

function PrivyWalletGate({ children }) {
  const { ready, authenticated, user, logout, error: privyError } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { exportWallet } = useExportWallet();
  const [error, setError] = useState("");
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const noteLogin = useCallback((nextUser, loginMethod) => {
    if (loginMethod !== "email" && loginMethod !== "google") return;
    if (nextUser?.id) userRef.current = nextUser;
    setError("");
    ensureEmbeddedWallet(() => userRef.current, () => createWallet(), loginMethod).catch((err) => {
      if (findEmbeddedWallet(userRef.current)) return;
      setError(err instanceof Error ? err.message : "Could not create the wallet.");
    });
  }, [createWallet]);

  const noteLoginRef = useRef(noteLogin);
  useEffect(() => {
    noteLoginRef.current = noteLogin;
  }, [noteLogin]);

  const onGoogleComplete = useCallback(({ user: nextUser, loginMethod }) => {
    if (loginMethod !== "google") return;
    noteLoginRef.current(nextUser, "google");
  }, []);

  const onGoogleError = useCallback((err) => {
    setError(err instanceof Error ? err.message : "Google sign-in did not finish.");
  }, []);

  const { initOAuth } = useLoginWithOAuth({
    onComplete: onGoogleComplete,
    onError: onGoogleError,
  });

  const initGoogle = useCallback(() => initOAuth({ provider: "google" }), [initOAuth]);

  const openExport = useCallback(() => {
    const wallet = findEmbeddedWallet(userRef.current);
    if (!wallet) return undefined;
    return Promise.resolve(exportWallet()).catch((err) => {
      setError(err instanceof Error ? err.message : "Could not open wallet export.");
    });
  }, [exportWallet]);

  const wallet = findEmbeddedWallet(user);
  const emailOrGoogle = isEmailOrGoogleUser(user);
  const account = ready && authenticated && emailOrGoogle ? accountFromPrivy(user) : null;
  const shownError = error || (privyError instanceof Error ? privyError.message : "");

  const value = useMemo(() => ({
    enabled: true,
    ready,
    authenticated: Boolean(ready && authenticated && emailOrGoogle),
    account,
    address: wallet?.address || "",
    userId: account?.id || "",
    error: shownError,
    initGoogle,
    exportWallet: wallet ? openExport : null,
    logout,
    noteLogin,
  }), [
    ready,
    authenticated,
    emailOrGoogle,
    account,
    wallet,
    shownError,
    initGoogle,
    openExport,
    logout,
    noteLogin,
  ]);

  return <PrivySessionContext.Provider value={value}>{children}</PrivySessionContext.Provider>;
}

export default PrivyWalletGate;
