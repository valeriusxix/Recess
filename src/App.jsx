import { Component, useEffect } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import "./App.css";
import { AuthProvider } from "./auth/AuthProvider";
import PrivyWalletGate from "./auth/PrivyWalletGate";
import { privyAppId, privyConfig } from "./auth/privyConfig";
import { usePrivySession } from "./auth/PrivySessionContext";
import { useAuth } from "./auth/useAuth";
import ForgotPassword from "./Components/ForgotPassword";
import ProductShell from "./Components/ProductShell";
import SignIn from "./Components/SignIn";
import SignUp from "./Components/SignUp";
import SonarGrid from "./Components/ui/sonar-grid";

function currentPath() {
  const path = window.location.pathname;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function SessionLoading({ message = "" }) {
  return (
    <section className="signup-page">
      <div className="signup-card">
        {message ? (
          <>
            <h1>Privy did not start</h1>
            <p className="signup-error" role="alert">{message}</p>
          </>
        ) : (
          <p className="signup-subtitle">Loading your session…</p>
        )}
      </div>
    </section>
  );
}

function AppFrame() {
  const { user: localUser } = useAuth();
  const session = usePrivySession();
  const user = session.account || localUser;
  const path = currentPath();

  useEffect(() => {
    if (user && path === "/signin") window.history.replaceState(null, "", "/");
  }, [user, path]);

  let page = <SignUp />;
  if (!session.ready) page = <SessionLoading message={session.error} />;
  if (session.ready && !user && path === "/signin") page = <SignIn />;
  if (session.ready && !user && path === "/forgot-password") page = <ForgotPassword />;
  if (session.ready && user && path === "/forgot-password") page = <ForgotPassword />;
  if (session.ready && user && path !== "/forgot-password") {
    page = <ProductShell path={path === "/signin" ? "/" : path} />;
  }

  return (
    <div className="App">
      <div className="App-background" aria-hidden="true">
        <SonarGrid
          color="#ffdf00"
          spacing={26}
          dotRadius={1.4}
          baseOpacity={0.28}
          pingEvery={2.4}
          speed={260}
          ringWidth={90}
          amplitude={2.2}
          interactive
          className="sonar-grid-background"
        />
      </div>
      <div className="App-content">{page}</div>
    </div>
  );
}

class PrivyStartupError extends Component {
  constructor(props) {
    super(props);
    this.state = { message: "" };
  }

  static getDerivedStateFromError(error) {
    return { message: error instanceof Error ? error.message : "Privy did not start." };
  }

  render() {
    if (!this.state.message) return this.props.children;
    return (
      <div className="App">
        <div className="App-background" aria-hidden="true">
          <SonarGrid
            color="#ffdf00"
            spacing={26}
            dotRadius={1.4}
            baseOpacity={0.28}
            pingEvery={2.4}
            speed={260}
            ringWidth={90}
            amplitude={2.2}
            interactive
            className="sonar-grid-background"
          />
        </div>
        <div className="App-content">
          <section className="signup-page">
            <div className="signup-card">
              <h1>Privy did not start</h1>
              <p className="signup-error" role="alert">{this.state.message}</p>
            </div>
          </section>
        </div>
      </div>
    );
  }
}

function App() {
  const framed = (
    <AuthProvider>
      <AppFrame />
    </AuthProvider>
  );
  if (!privyAppId) return framed;
  return (
    <PrivyStartupError>
      <PrivyProvider appId={privyAppId} config={privyConfig}>
        <PrivyWalletGate>{framed}</PrivyWalletGate>
      </PrivyProvider>
    </PrivyStartupError>
  );
}

export default App;
