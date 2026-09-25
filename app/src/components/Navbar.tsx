import { Link } from "react-router-dom";
import { useCluster } from "../hooks/useCluster";
import { LiveUnavailableNotice } from "./LiveUnavailableNotice";
import { NetworkSwitch } from "./NetworkSwitch";
import { WalletConnectButton } from "./WalletConnectButton";

export function Navbar() {
  const { requestMainnet, notice, dismissNotice } = useCluster();
  return (
    <>
      <header className="border-b border-stone-300 bg-[#f7f3ea]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-4">
          <Link to="/" className="text-xl tracking-tight">
            Recess
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/">Buy coverage</Link>
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/pool">Liquidity</Link>
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <NetworkSwitch onMainnet={requestMainnet} />
            <WalletConnectButton />
          </div>
        </div>
      </header>
      <LiveUnavailableNotice open={notice.length > 0} onClose={dismissNotice} />
    </>
  );
}
