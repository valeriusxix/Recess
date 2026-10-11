import { useEffect, useRef, useState } from "react";
import { isGoogleCancellation } from "../auth/google";
import { useAuth } from "../auth/useAuth";
import { discoverWallets } from "../auth/wallet";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <rect x="2.75" y="6" width="18.5" height="13" rx="2.25" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2.75 10h18.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16.25" cy="14.25" r="1.15" fill="currentColor" />
    </svg>
  );
}

function AuthMethods({ mode, disabled = false, onPendingChange, remember = true, evmOnly = false, onGoogle }) {
  const { continueWithGoogle, continueWithProvider } = useAuth();
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState(null);
  const liveRef = useRef(true);
  const signingUp = mode === "signup";
  const googleLabel = signingUp ? "Sign up with Google" : "Sign in with Google";
  const walletLabel = signingUp ? "Sign up with a wallet" : "Sign in with a wallet";

  function updatePending(next) {
    setPending(next);
    onPendingChange?.(next !== null);
  }

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
    };
  }, []);

  async function finishWallet(wallet) {
    setError("");
    updatePending("wallet");
    try {
      const profile = await wallet.signIn();
      if (!liveRef.current) return;
      continueWithProvider(profile, { remember });
      updatePending(null);
    } catch (err) {
      if (!liveRef.current) return;
      setError(err instanceof Error ? err.message : "The wallet could not complete sign-in.");
      updatePending(null);
    }
  }

  async function handleWallet() {
    setError("");
    updatePending("discover");
    try {
      const found = await discoverWallets({ evmOnly });
      if (!liveRef.current) return;
      if (found.length === 0) {
        setError(
          evmOnly
            ? "No EVM wallet was found. Install MetaMask, Rabby, Coinbase Wallet, or another browser wallet, then try again."
            : "No browser wallet was found. Install MetaMask, Rabby, Coinbase Wallet, or Phantom, then try again.",
        );
        updatePending(null);
        return;
      }
      if (found.length === 1) {
        await finishWallet(found[0]);
        return;
      }
      setChoices(found);
      updatePending(null);
    } catch (err) {
      if (!liveRef.current) return;
      setError(err instanceof Error ? err.message : "Could not look for wallets.");
      updatePending(null);
    }
  }

  async function handleGoogle() {
    setError("");
    setChoices(null);
    updatePending("google");
    try {
      if (onGoogle) await onGoogle();
      else await continueWithGoogle({ remember });
    } catch (err) {
      if (!liveRef.current || isGoogleCancellation(err)) return;
      setError(err instanceof Error ? err.message : "Google sign-in did not finish.");
    } finally {
      if (liveRef.current) updatePending(null);
    }
  }

  if (choices) {
    return (
      <div className="signup-wallet-list">
        <p className="signup-hint">Choose a wallet</p>
        {choices.map((wallet) => (
          <button
            className="signup-wallet-choice"
            disabled={disabled || pending !== null}
            key={wallet.id}
            type="button"
            onClick={() => finishWallet(wallet)}
          >
            {wallet.icon ? <img alt="" src={wallet.icon} /> : <WalletIcon />}
            <span>{wallet.name}</span>
          </button>
        ))}
        <button
          className="signup-text-button"
          disabled={pending !== null}
          type="button"
          onClick={() => {
            setChoices(null);
            setError("");
          }}
        >
          Back
        </button>
        {error ? (
          <p className="signup-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  let walletText = walletLabel;
  if (pending === "discover") walletText = "Looking for wallets…";
  if (pending === "wallet") walletText = "Waiting for wallet…";

  return (
    <div className="signup-providers">
      <button
        className="signup-provider"
        disabled={disabled || pending !== null}
        type="button"
        onClick={handleGoogle}
      >
        <GoogleIcon />
        <span>{pending === "google" ? "Waiting for Google…" : googleLabel}</span>
      </button>
      <button
        className="signup-provider"
        disabled={disabled || pending !== null}
        type="button"
        onClick={handleWallet}
      >
        <WalletIcon />
        <span>{walletText}</span>
      </button>
      {error ? (
        <p className="signup-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default AuthMethods;
