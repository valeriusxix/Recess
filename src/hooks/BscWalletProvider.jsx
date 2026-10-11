import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { simulateWrite } from "../lib/simulate";
import { BSC_CHAIN_ID } from "../lib/tokens";
import { BscWalletContext } from "./BscWalletContext";

function ethereumProvider() {
  if (typeof window === "undefined") return null;
  return window.ethereum || null;
}

function chainNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseInt(value, value.startsWith("0x") ? 16 : 10);
  return null;
}

async function switchToBsc(provider) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x38" }],
    });
  } catch (error) {
    if (error?.code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x38",
        chainName: "BNB Smart Chain",
        nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
        rpcUrls: ["https://bsc-dataseed.binance.org"],
        blockExplorerUrls: ["https://bscscan.com"],
      }],
    });
  }
}

export function BscWalletProvider({ children, authenticatedWalletAddress = "" }) {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);
  const accountRef = useRef("");
  const chainRef = useRef(null);
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const connectionModeRef = useRef("");

  useEffect(() => {
    accountRef.current = account;
    chainRef.current = chainId;
  }, [account, chainId]);

  useEffect(() => {
    const provider = ethereumProvider();
    if (!provider) return undefined;
    let live = true;
    let accountChangeObserved = false;
    connectionModeRef.current = "";

    if (authenticatedWalletAddress) {
      const expectedAddress = authenticatedWalletAddress.toLowerCase();
      provider.request({ method: "eth_accounts" }).then((accounts) => {
        if (!live || accountChangeObserved || connectionModeRef.current === "connected") return;
        const matchingAddress = accounts?.find(
          (address) => address?.toLowerCase() === expectedAddress,
        ) || "";
        connectionModeRef.current = matchingAddress ? "authenticated" : "";
        setAccount(matchingAddress);
      }).catch((err) => {
        if (live) {
          const message = String(err?.message || "");
          setError(message && message.length < 180 ? message : "Could not check the signed-in wallet.");
        }
      });
    }

    provider.request({ method: "eth_chainId" }).then((id) => {
      if (live) setChainId(chainNumber(id));
    }).catch(() => {});

    function onAccounts(accounts) {
      accountChangeObserved = true;
      if (connectionModeRef.current === "connected") {
        const nextAccount = accounts?.[0] || "";
        connectionModeRef.current = nextAccount ? "connected" : "";
        setAccount(nextAccount);
        return;
      }

      const expectedAddress = authenticatedWalletAddress.toLowerCase();
      const matchingAddress = expectedAddress
        ? accounts?.find((address) => address?.toLowerCase() === expectedAddress) || ""
        : "";
      connectionModeRef.current = matchingAddress ? "authenticated" : "";
      setAccount(matchingAddress);
    }
    function onChain(id) {
      setChainId(chainNumber(id));
    }

    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    return () => {
      live = false;
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [authenticatedWalletAddress]);

  const connect = useCallback(async () => {
    const provider = ethereumProvider();
    if (!provider) {
      setError("No browser wallet was found. Install MetaMask, Rabby, or Coinbase Wallet, then try again.");
      return false;
    }
    setError("");
    setPending(true);
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const nextAccount = accounts?.[0] || "";
      connectionModeRef.current = nextAccount ? "connected" : "";
      accountRef.current = nextAccount;
      setAccount(nextAccount);
      let id = chainNumber(await provider.request({ method: "eth_chainId" }));
      chainRef.current = id;
      setChainId(id);
      if (id !== BSC_CHAIN_ID) {
        await switchToBsc(provider);
        id = chainNumber(await provider.request({ method: "eth_chainId" }));
        chainRef.current = id;
        setChainId(id);
        if (id !== BSC_CHAIN_ID) {
          setError("Switch the wallet to BNB Smart Chain before sending.");
          return false;
        }
      }
      return nextAccount || false;
    } catch (err) {
      const message = String(err?.message || "");
      if (err?.code === 4001 || /rejected|denied|cancel/i.test(message)) {
        setError("The wallet request was cancelled.");
      } else {
        setError(message && message.length < 180 ? message : "The wallet could not connect.");
      }
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  const sendTransaction = useCallback(async ({ to, data, value = "0x0" }) => {
    const provider = ethereumProvider();
    const from = accountRef.current;
    if (!provider || !from) {
      setError("Connect a wallet on BNB Smart Chain first.");
      return null;
    }
    setSending(true);
    setError("");
    try {
      const liveChain = chainNumber(await provider.request({ method: "eth_chainId" }));
      chainRef.current = liveChain;
      setChainId(liveChain);
      if (liveChain !== BSC_CHAIN_ID) {
        setError("Switch the wallet to BNB Smart Chain before sending.");
        return null;
      }
      const simulation = await simulateWrite({ from, to, data, value });
      if (simulation.blocked) {
        setError(simulation.message);
        return null;
      }
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [{ from, to, data, value }],
      });
      return { hash, warning: simulation.warning || "" };
    } catch (err) {
      const message = String(err?.message || "");
      if (err?.code === 4001 || /rejected|denied|cancel/i.test(message)) {
        setError("The wallet request was cancelled.");
      } else {
        setError(message && message.length < 180 ? message : "The wallet could not send the transaction.");
      }
      return null;
    } finally {
      setSending(false);
    }
  }, []);

  const value = useMemo(() => ({
    account,
    chainId,
    pending,
    sending,
    error,
    available: Boolean(ethereumProvider()),
    onBsc: chainId === BSC_CHAIN_ID,
    connect,
    sendTransaction,
    clearError: () => setError(""),
  }), [account, chainId, pending, sending, error, connect, sendTransaction]);

  return <BscWalletContext.Provider value={value}>{children}</BscWalletContext.Provider>;
}
