import { useState } from "react";
import { usePrivySession } from "../auth/PrivySessionContext";
import { useAuth } from "../auth/useAuth";
import { useBscWallet } from "../hooks/useBscWallet";
import { usePoolState } from "../hooks/usePoolState";
import recessLogo from "../assets/recess-logo.png";
import WalletButton from "./WalletButton";
import "./NavBar.css";

const LINKS = [
  { href: "/coverage", label: "Cover" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/pool", label: "Pool" },
  { href: "/monitor", label: "Monitor" },
];

function NavBar({ path }) {
  const { signOut } = useAuth();
  const session = usePrivySession();
  const { error } = useBscWallet();
  const { pool } = usePoolState();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    try {
      if (session.logout && session.authenticated) await session.logout();
    } finally {
      signOut();
      window.location.assign("/");
    }
  }

  return (
    <header className="nav">
      <a className="nav-brand" href="/">
        <img alt="" src={recessLogo} />
        <span>Recess</span>
      </a>
      {pool?.demoMode ? <strong className="nav-demo">DEMO MODE</strong> : null}
      <button
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="nav-menu"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span />
        <span />
        <span />
      </button>
      <div className={open ? "nav-panel is-open" : "nav-panel"}>
        <nav aria-label="Product">
          {LINKS.map((link) => (
            <a aria-current={path === link.href ? "page" : undefined} href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="nav-account">
          <WalletButton
            address={session.address}
            exportWallet={session.exportWallet}
            onSignOut={handleSignOut}
          />
        </div>
      </div>
      {session.error || error ? (
        <p className="nav-error" role="alert">
          {session.error || error}
        </p>
      ) : null}
    </header>
  );
}

export default NavBar;
