import { useState } from "react";
import { usePrivySession } from "../auth/PrivySessionContext";
import { useAuth } from "../auth/useAuth";
import AuthMethods from "./AuthMethods";
import EmailCodeForm from "./EmailCodeForm";
import SignedIn from "./SignedIn";
import "./SignUp.css";

function SignUp() {
  const { user } = useAuth();
  if (user) return <SignedIn />;
  return <SignUpForm />;
}

function SignUpForm() {
  const { signUpWithEmail } = useAuth();
  const session = usePrivySession();
  const [error, setError] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [providersBusy, setProvidersBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (emailBusy || providersBusy) return;

    const data = new FormData(event.currentTarget);
    setError("");
    setEmailBusy(true);
    try {
      await signUpWithEmail({
        name: data.get("name"),
        email: data.get("email"),
        password: data.get("password"),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account.");
    } finally {
      setEmailBusy(false);
    }
  }

  return (
    <section className="signup-page" aria-labelledby="signup-title">
      <div className="signup-card">
        <header className="signup-header">
          <h1 id="signup-title">Create your account</h1>
          <p className="signup-subtitle">
            Already have an account? <a href="/signin">Sign in</a>
          </p>
        </header>

        <AuthMethods
          disabled={emailBusy}
          mode="signup"
          onGoogle={session.enabled ? session.initGoogle : undefined}
          onPendingChange={setProvidersBusy}
        />
        <div className="signup-divider">or</div>

        {session.enabled ? (
          <EmailCodeForm disabled={providersBusy} idPrefix="signup" onPendingChange={setEmailBusy} />
        ) : (
        <form className="signup-form" onSubmit={handleSubmit}>
          <div className="signup-field">
            <label htmlFor="signup-name">Full name</label>
            <input
              autoComplete="name"
              disabled={emailBusy || providersBusy}
              id="signup-name"
              name="name"
              placeholder="Jane Smith"
              required
            />
          </div>

          <div className="signup-field">
            <label htmlFor="signup-email">Email address</label>
            <input
              autoComplete="email"
              disabled={emailBusy || providersBusy}
              id="signup-email"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
          </div>

          <div className="signup-field">
            <label htmlFor="signup-password">Password</label>
            <input
              autoComplete="new-password"
              aria-describedby="signup-password-hint"
              disabled={emailBusy || providersBusy}
              id="signup-password"
              minLength={8}
              name="password"
              placeholder="Create a password"
              required
              type="password"
            />
            <p className="signup-hint" id="signup-password-hint">
              Use at least 8 characters.
            </p>
          </div>

          <button className="signup-submit" disabled={emailBusy || providersBusy} type="submit">
            {emailBusy ? "Creating account…" : "Create account"}
          </button>

          {error ? (
            <p className="signup-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
        )}

        <p className="signup-legal">
          By creating an account, you agree to our <a href="/terms">Terms</a> and{" "}
          <a href="/privacy">Privacy Policy</a>.
        </p>
      </div>
    </section>
  );
}

export default SignUp;
