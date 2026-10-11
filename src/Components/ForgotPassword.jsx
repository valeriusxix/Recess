import { useState } from "react";
import { useAuth } from "../auth/useAuth";
import "./SignUp.css";

function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending) return;

    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    const confirm = String(data.get("confirm") || "");
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }

    setError("");
    setPending(true);
    try {
      await resetPassword({
        email: data.get("email"),
        password,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the password.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="signup-page" aria-labelledby="forgot-title">
      <div className="signup-card">
        <header className="signup-header">
          <h1 id="forgot-title">Reset your password</h1>
          <p className="signup-subtitle">
            Choose a new password for the email account on this browser.{" "}
            <a href="/signin">Back to sign in</a>
          </p>
        </header>
        {done ? (
          <div className="signup-actions">
            <p className="signup-success" role="status">
              Your password is updated. You can sign in with it now.
            </p>
            <a className="signup-submit" href="/signin">
              Sign in
            </a>
          </div>
        ) : (
          <form className="signup-form" onSubmit={handleSubmit}>
            <div className="signup-field">
              <label htmlFor="forgot-email">Email address</label>
              <input
                autoComplete="email"
                disabled={pending}
                id="forgot-email"
                name="email"
                placeholder="you@example.com"
                required
                type="email"
              />
            </div>
            <div className="signup-field">
              <label htmlFor="forgot-password">New password</label>
              <input
                autoComplete="new-password"
                disabled={pending}
                id="forgot-password"
                minLength={8}
                name="password"
                placeholder="At least 8 characters"
                required
                type="password"
              />
            </div>
            <div className="signup-field">
              <label htmlFor="forgot-confirm">Confirm password</label>
              <input
                autoComplete="new-password"
                disabled={pending}
                id="forgot-confirm"
                minLength={8}
                name="confirm"
                placeholder="Repeat the new password"
                required
                type="password"
              />
            </div>
            {error ? (
              <p className="signup-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="signup-submit" disabled={pending} type="submit">
              {pending ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

export default ForgotPassword;
