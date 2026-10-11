import { usePrivySession } from "../auth/PrivySessionContext";
import { useAuth } from "../auth/useAuth";
import { BscWalletProvider } from "../hooks/BscWalletProvider";
import { PoolStateProvider } from "../hooks/PoolStateProvider";
import { SettlementProvider } from "../hooks/SettlementProvider";
import { usePoolState } from "../hooks/usePoolState";
import ActivityAlerts from "./ActivityAlerts";
import DemoReleaseNote from "./DemoReleaseNote";
import NavBar from "./NavBar";
import SettlementPicker from "./SettlementPicker";
import Coverage from "../Pages/Coverage";
import Dashboard from "../Pages/Dashboard";
import Home from "../Pages/Home";
import Monitor from "../Pages/Monitor";
import Pool from "../Pages/Pool";
import Portfolio from "../Pages/Portfolio";
import "../Pages/product.css";

const PAGES = {
  "/": Home,
  "/coverage": Coverage,
  "/dashboard": Dashboard,
  "/pool": Pool,
  "/monitor": Monitor,
  "/portfolio": Portfolio,
};

function Missing() {
  return (
    <section className="page-intro">
      <h1>That page is not in Recess.</h1>
      <p><a className="product-primary" href="/">Back home</a></p>
    </section>
  );
}

function PoolBanner() {
  const { pool, error } = usePoolState();
  if (error) {
    return <p className="product-alert" role="alert">{error}</p>;
  }
  if (!pool?.paused) return null;
  return (
    <p className="product-alert" role="status">
      The pool is paused. New deposits and new covers are closed. Claims and withdrawals still work.
    </p>
  );
}

function ProductShell({ path }) {
  const Page = PAGES[path] || Missing;
  const { user } = useAuth();
  const session = usePrivySession();
  const activeUser = session.account || user;
  const authenticatedWalletAddress = activeUser?.method === "wallet"
    ? activeUser.walletAddress
    : "";

  return (
    <SettlementProvider>
      <BscWalletProvider
        authenticatedWalletAddress={authenticatedWalletAddress}
        key={activeUser?.id || ""}
      >
        <PoolStateProvider>
          <div className="product-shell">
            <NavBar path={path} />
            <ActivityAlerts />
            <main className="product-main">
              <PoolBanner />
              <DemoReleaseNote />
              <SettlementPicker />
              <Page />
            </main>
          </div>
        </PoolStateProvider>
      </BscWalletProvider>
    </SettlementProvider>
  );
}

export default ProductShell;
