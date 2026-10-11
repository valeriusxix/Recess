import { useAuth } from "../auth/useAuth";
import { shortAddress } from "../auth/wallet";
import "./SignUp.css";

function accountLine(user) {
  if (user.method === "wallet") {
    return `Signed in with a wallet · ${shortAddress(user.walletAddress)}`;
  }
  if (user.method === "google") {
    return user.email ? `Signed in with Google · ${user.email}` : "Signed in with Google";
  }
  return user.email ? `Signed in with email · ${user.email}` : "Signed in with email";
}

function SignedIn() {
  const { user, remembersDevice, signOut } = useAuth();
  if (!user) return null;

  return (
    <section className="signup-page" aria-labelledby="signed-in-title">
      <div className="signup-card">
        <header className="signup-header">
          <p className="signup-eyebrow">Signed in</p>
          <h1 id="signed-in-title">{user.name}</h1>
          <p className="signup-subtitle">{accountLine(user)}</p>
        </header>
        <p className="signup-session-note">
          {remembersDevice
            ? "You stay signed in on this browser until you have been away for a week, or until you sign out."
            : "You stay signed in on this browser until you close it, or until you sign out."}
        </p>
        <button className="signup-submit" type="button" onClick={signOut}>
          Sign out
        </button>
      </div>
    </section>
  );
}

export default SignedIn;
