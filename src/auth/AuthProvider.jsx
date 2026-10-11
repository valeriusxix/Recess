import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "./AuthContext";
import {
  registerEmailAccount,
  resetEmailPassword,
  saveProviderAccount,
  signInEmailAccount,
} from "./accounts";
import {
  GOOGLE_SETUP_MESSAGE,
  fetchGoogleProfile,
  googleCancelled,
  googleClientId,
  googleErrorMessage,
  isGoogleCancelCode,
  loadGoogleIdentity,
  revokeGoogleToken,
} from "./google";
import { SESSION_KEY, clearSession, loadSession, peekSession, startSession, touchSession } from "./session";

function openProductHome() {
  const path = window.location.pathname;
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  if (normalized === "/") {
    window.location.reload();
    return;
  }
  window.location.replace("/");
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => loadSession());
  const googleClientRef = useRef(null);
  const googleWaiterRef = useRef(null);
  const googleLoadErrorRef = useRef(null);

  useEffect(() => {
    if (!session?.user?.id) return undefined;

    function refresh() {
      const next = touchSession(Date.now());
      if (!next) setSession(null);
    }

    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.clearInterval(interval);
    };
  }, [session?.user?.id]);

  useEffect(() => {
    function onStorage(event) {
      if (event.key !== SESSION_KEY) return;
      setSession(peekSession());
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!googleClientId) return undefined;
    let cancelled = false;

    loadGoogleIdentity()
      .then((google) => {
        if (cancelled) return;
        googleClientRef.current = google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: "openid email profile",
          callback: (response) => {
            googleWaiterRef.current?.(response);
          },
          error_callback: (error) => {
            const type = typeof error === "string" ? error : error?.type;
            googleWaiterRef.current?.({ error: type || "popup_failed_to_open" });
          },
        });
      })
      .catch((error) => {
        googleLoadErrorRef.current = error;
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signUpWithEmail = useCallback(async (input) => {
    const user = await registerEmailAccount(input);
    const next = startSession(user);
    setSession(next);
    return next;
  }, []);

  const signInWithEmail = useCallback(async (input) => {
    const user = await signInEmailAccount(input);
    const next = startSession(user, Date.now(), { remember: input?.remember === true });
    setSession(next);
    return next;
  }, []);

  const continueWithProvider = useCallback((profile, options) => {
    const user = saveProviderAccount(profile);
    const remember = !options || !Object.prototype.hasOwnProperty.call(options, "remember")
      ? true
      : options.remember === true;
    const next = startSession(user, Date.now(), { remember });
    setSession(next);
    return next;
  }, []);

  const continueWithGoogle = useCallback((options) => {
    const remember = !options || !Object.prototype.hasOwnProperty.call(options, "remember")
      ? true
      : options.remember === true;
    if (!googleClientId) return Promise.reject(new Error(GOOGLE_SETUP_MESSAGE));
    if (googleLoadErrorRef.current) return Promise.reject(googleLoadErrorRef.current);

    const client = googleClientRef.current;
    if (!client) {
      return Promise.reject(new Error("Google is still loading. Try again in a moment."));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let popupOpened = false;
      let gotToken = false;
      let dismissTimer = 0;

      const stopWatching = () => {
        window.clearTimeout(dismissTimer);
        window.removeEventListener("blur", onBlur);
        window.removeEventListener("focus", onFocus);
      };

      const finish = (callback) => {
        if (settled) return;
        settled = true;
        stopWatching();
        callback();
      };

      const cancelIfAbandoned = () => {
        if (gotToken || settled) return;
        finish(() => reject(googleCancelled()));
      };

      // Google closes its window after a success and after a cancel, and often
      // never calls back. A token can arrive after that close; only a close
      // with no token is a cancellation.
      const onBlur = () => {
        popupOpened = true;
        window.clearTimeout(dismissTimer);
      };
      const onFocus = () => {
        if (!popupOpened || settled || gotToken) return;
        window.clearTimeout(dismissTimer);
        dismissTimer = window.setTimeout(cancelIfAbandoned, 600);
      };

      const acceptToken = (accessToken) => {
        gotToken = true;
        window.clearTimeout(dismissTimer);
        stopWatching();
        googleWaiterRef.current = null;
        fetchGoogleProfile(accessToken)
          .then((profile) => {
            revokeGoogleToken(accessToken);
            const session = continueWithProvider(profile, { remember });
            openProductHome();
            finish(() => resolve(session));
          })
          .catch((error) => {
            finish(() => reject(error));
          });
      };

      googleWaiterRef.current = (response) => {
        if (response?.access_token) {
          if (!gotToken) acceptToken(response.access_token);
          return;
        }
        if (gotToken) return;

        window.clearTimeout(dismissTimer);
        if (response?.error && isGoogleCancelCode(response.error)) {
          dismissTimer = window.setTimeout(cancelIfAbandoned, 600);
          return;
        }
        if (response?.error) {
          googleWaiterRef.current = null;
          finish(() => reject(new Error(googleErrorMessage(response.error))));
          return;
        }
        googleWaiterRef.current = null;
        finish(() => reject(new Error("Google did not return a sign-in token.")));
      };

      window.addEventListener("blur", onBlur);
      window.addEventListener("focus", onFocus);
      popupOpened = true;

      try {
        client.requestAccessToken({ prompt: "select_account" });
      } catch (error) {
        googleWaiterRef.current = null;
        finish(() => {
          reject(error instanceof Error ? error : new Error("Google sign-in could not open."));
        });
      }
    });
  }, [continueWithProvider]);

  const resetPassword = useCallback(async (input) => {
    await resetEmailPassword(input);
    clearSession();
    setSession(null);
  }, []);

  const signOut = useCallback(() => {
    googleWaiterRef.current = null;
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      remembersDevice: session ? session.remember !== false : false,
      signUpWithEmail,
      signInWithEmail,
      continueWithGoogle,
      continueWithProvider,
      resetPassword,
      signOut,
    }),
    [
      session,
      signUpWithEmail,
      signInWithEmail,
      continueWithGoogle,
      continueWithProvider,
      resetPassword,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
