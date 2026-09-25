import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { useMemo } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { ClusterProvider, useCluster } from "./hooks/useCluster";
import { fetchWithTimeout } from "./lib/anchorClient";
import { BuyCoverage } from "./pages/BuyCoverage";
import { Dashboard } from "./pages/Dashboard";
import { LiquidityPool } from "./pages/LiquidityPool";

function AppShell() {
  const { rpc } = useCluster();
  const wallets = useMemo(() => [], []);
  const connectionConfig = useMemo(
    () => ({ commitment: "confirmed" as const, fetch: fetchWithTimeout }),
    []
  );
  return (
    <ConnectionProvider endpoint={rpc} config={connectionConfig}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <BrowserRouter>
            <Navbar />
            <Routes>
              <Route path="/" element={<BuyCoverage />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/pool" element={<LiquidityPool />} />
            </Routes>
          </BrowserRouter>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default function App() {
  return (
    <ClusterProvider>
      <AppShell />
    </ClusterProvider>
  );
}
