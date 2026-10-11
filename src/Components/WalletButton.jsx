import { useEffect, useRef, useState } from "react";
import { shortAddress } from "../auth/wallet";
import { useBscWallet } from "../hooks/useBscWallet";

function WalletButton({ address = "", exportWallet = null, onSignOut }) {
  const { account, pending, connect } = useBscWallet();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const menuRef = useRef(null);
  const copyAddress = address || account;
  const label = address
    ? shortAddress(address)
    : account
      ? shortAddress(account)
      : "Connect wallet";

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleCopy() {
    if (!copyAddress) return;
    try {
      await navigator.clipboard.writeText(copyAddress);
      setMessage("Address copied");
    } catch {
      setMessage("Could not copy the address. Check clipboard permissions.");
    }
  }

  async function handleExport() {
    setMessage("");
    await exportWallet?.();
    setOpen(false);
  }

  async function handleConnect() {
    setMessage("");
    await connect();
    setOpen(false);
  }

  async function handleSignOut() {
    setOpen(false);
    await onSignOut?.();
  }

  return (
    <div className="nav-wallet-menu" ref={menuRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="nav-wallet"
        disabled={pending}
        type="button"
        onClick={() => {
          setMessage("");
          setOpen((current) => !current);
        }}
      >
        {pending ? "Connecting…" : label}
      </button>
      {open ? (
        <div className="nav-wallet-dropdown" role="menu">
          <button
            disabled={!copyAddress}
            role="menuitem"
            type="button"
            onClick={handleCopy}
          >
            Copy address
          </button>
          <a className="nav-wallet-menu-link" href="/portfolio" role="menuitem">
            Portfolio
          </a>
          {exportWallet ? (
            <button role="menuitem" type="button" onClick={handleExport}>
              Export wallet
            </button>
          ) : null}
          <button role="menuitem" type="button" onClick={handleConnect}>
            Connect another wallet
          </button>
          <button role="menuitem" type="button" onClick={handleSignOut}>
            Sign out
          </button>
          {message ? <p role="status">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export default WalletButton;
