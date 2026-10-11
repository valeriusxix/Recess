import { useState } from "react";
import { usePrivySession } from "../auth/PrivySessionContext";
import { useAuth } from "../auth/useAuth";
import AuthMethods from "./AuthMethods";
import EmailCodeForm from "./EmailCodeForm";
import SignedIn from "./SignedIn";
import "./SignUp.css";

function SignIn() {
  const { user } = useAuth();
  if (user) return <SignedIn />;
  return <SignInForm />;
}

function SignInForm() {
  const { signInWithEmail } = useAuth();
  const session = usePrivySession();
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [providersBusy, setProvidersBusy] = useState(false);
  const busy = emailBusy || providersBusy;

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;

    const data = new FormData(event.currentTarget);
    setError("");
    setEmailBusy(true);
    try {
      await signInWithEmail({
        email: data.get("email"),
        password: data.get("password"),
        remember,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <section className="signup-page" aria-labelledby="signin-title">
      <div className="signup-card">
        <header className="signup-header">
          <h1 id="signin-title">Sign in</h1>
          <p className="signup-subtitle">
            New here? <a href="/">Create an account</a>
          </p>
        </header>

        <AuthMethods
          disabled={emailBusy}
          evmOnly
          mode="signin"
          onGoogle={session.enabled ? session.initGoogle : undefined}
          remember={remember}
          onPendingChange={setProvidersBusy}
        />
        {session.enabled ? (
          <div className="signup-row signup-remember-row">
            <label className="signup-remember">
              <input
                checked={remember}
                disabled={busy}
                id="signin-remember"
                name="remember"
                type="checkbox"
                onChange={(event) => setRemember(event.target.checked)}
              />
              Remember me
            </label>
            <a href="/forgot-password">Forgot password?</a>
          </div>
        ) : null}
        <div className="signup-divider">or</div>

        {session.enabled ? (
          <EmailCodeForm disabled={providersBusy} idPrefix="signin" onPendingChange={setEmailBusy} />
        ) : (
        <form className="signup-form" onSubmit={handleSubmit}>
          <div className="signup-field">
            <label htmlFor="signin-email">Email address</label>
            <input
              autoComplete="email"
              disabled={busy}
              id="signin-email"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
          </div>
          <div className="signup-field">
            <label htmlFor="signin-password">Password</label>
            <input
              autoComplete="current-password"
              disabled={busy}
              id="signin-password"
              name="password"
              placeholder="Your password"
              required
              type="password"
            />
          </div>
          <div className="signup-row">
            <label className="signup-remember">
              <input
                checked={remember}
                disabled={busy}
                id="signin-remember"
                name="remember"
                type="checkbox"
                onChange={(event) => setRemember(event.target.checked)}
              />
              Remember me
            </label>
            <a href="/forgot-password">Forgot password?</a>
          </div>
          <button className="signup-submit" disabled={busy} type="submit">
            {emailBusy ? "Signing in…" : "Sign in"}
          </button>
          {error ? (
            <p className="signup-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
        )}
      </div>
    </section>
  );
}

export default SignIn;
