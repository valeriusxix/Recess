import { useEffect, useRef, useState } from "react";
import { useLoginWithEmail } from "@privy-io/react-auth";
import { usePrivySession } from "../auth/PrivySessionContext";

function EmailCodeForm({ idPrefix, disabled = false, onPendingChange }) {
  const session = usePrivySession();
  const noteLoginRef = useRef(session.noteLogin);
  useEffect(() => {
    noteLoginRef.current = session.noteLogin;
  }, [session.noteLogin]);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState("email");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null);

  function setBusy(next) {
    setPending(next);
    onPendingChange?.(next !== null);
  }

  const { sendCode, loginWithCode } = useLoginWithEmail({
    onComplete: ({ user, loginMethod }) => {
      if (loginMethod && loginMethod !== "email") return;
      noteLoginRef.current?.(user, "email");
    },
  });

  async function handleSend(event) {
    event.preventDefault();
    if (disabled || pending) return;
    const nextEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setBusy("send");
    try {
      await sendCode({ email: nextEmail });
      setPhase("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code.");
    } finally {
      setBusy(null);
    }
  }

  async function handleVerify(event) {
    event.preventDefault();
    if (disabled || pending) return;
    const nextCode = code.trim();
    if (!nextCode) {
      setError("Enter the code from your email.");
      return;
    }
    setError("");
    setBusy("verify");
    try {
      await loginWithCode({ code: nextCode });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code did not work.");
    } finally {
      setBusy(null);
    }
  }

  const shownError = error || session.error;
  const emailId = `${idPrefix}-email`;
  const codeId = `${idPrefix}-code`;

  if (phase === "code") {
    return (
      <form className="signup-form" onSubmit={handleVerify}>
        <p className="signup-hint">Enter the code sent to {email.trim()}.</p>
        <div className="signup-field">
          <label htmlFor={codeId}>Email code</label>
          <input
            autoComplete="one-time-code"
            disabled={disabled || pending !== null}
            id={codeId}
            inputMode="numeric"
            name="code"
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        <button className="signup-submit" disabled={disabled || pending !== null} type="submit">
          {pending === "verify" ? "Checking code…" : "Continue"}
        </button>
        <button
          className="signup-text-button"
          disabled={disabled || pending !== null}
          type="button"
          onClick={handleSend}
        >
          {pending === "send" ? "Sending code…" : "Send a new code"}
        </button>
        {shownError ? (
          <p className="signup-error" role="alert">
            {shownError}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <form className="signup-form" onSubmit={handleSend}>
      <div className="signup-field">
        <label htmlFor={emailId}>Email address</label>
        <input
          autoComplete="email"
          disabled={disabled || pending !== null}
          id={emailId}
          name="email"
          placeholder="you@example.com"
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <button className="signup-submit" disabled={disabled || pending !== null} type="submit">
        {pending === "send" ? "Sending code…" : "Email me a code"}
      </button>
      {shownError ? (
        <p className="signup-error" role="alert">
          {shownError}
        </p>
      ) : null}
    </form>
  );
}

export default EmailCodeForm;
