import { recoverMessageAddress } from "viem";

const DISCOVERY_MS = 500;

export function shortAddress(address) {
  if (!address || address.length < 11) return address || "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function randomNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildMessage(address, chainId) {
  return [
    "Recess sign-in",
    "",
    "This signature proves you control this wallet. It does not spend funds or approve a transaction.",
    "",
    `Address: ${address}`,
    `URI: ${window.location.origin}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${randomNonce()}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}

function utf8ToHex(value) {
  const bytes = new TextEncoder().encode(value);
  return `0x${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function safeIcon(icon) {
  if (typeof icon !== "string") return "";
  if (icon.startsWith("data:image/") || icon.startsWith("https://")) return icon;
  return "";
}

export function normalizeWalletError(error) {
  const code = error?.code;
  const message = String(error?.message || "");
  if (
    code === 4001 ||
    code === "ACTION_REJECTED" ||
    /user rejected|user denied|rejected the request|cancelled|canceled/i.test(message)
  ) {
    return new Error("The wallet request was cancelled.");
  }
  if (/pending request|already pending/i.test(message)) {
    return new Error("A wallet request is already open. Finish it in the wallet, then try again.");
  }
  if (!message || message.length > 180) {
    return new Error("The wallet could not complete sign-in.");
  }
  return new Error(message);
}

function injectedName(provider) {
  if (provider?.isMetaMask) return "MetaMask";
  if (provider?.isRabby) return "Rabby";
  if (provider?.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider?.isPhantom) return "Phantom";
  if (provider?.isBraveWallet) return "Brave Wallet";
  return "Browser wallet";
}

async function signInWithEvm(provider, name) {
  let accounts;
  try {
    accounts = await provider.request({ method: "eth_requestAccounts" });
  } catch (error) {
    throw normalizeWalletError(error);
  }

  const address = accounts?.[0];
  if (!address) throw new Error(`${name} did not return an account.`);

  let chainId = "unknown";
  try {
    const hex = await provider.request({ method: "eth_chainId" });
    const parsed = Number.parseInt(hex, 16);
    if (Number.isFinite(parsed)) chainId = String(parsed);
  } catch {
    chainId = "unknown";
  }

  const message = buildMessage(address, chainId);
  let signature;
  try {
    signature = await provider.request({
      method: "personal_sign",
      params: [utf8ToHex(message), address],
    });
  } catch (error) {
    throw normalizeWalletError(error);
  }

  let recovered;
  try {
    recovered = await recoverMessageAddress({ message, signature });
  } catch {
    throw new Error("The wallet signature did not match this account.");
  }
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    throw new Error("The wallet signature did not match this account.");
  }

  return {
    providerId: `wallet:eip155:${address.toLowerCase()}`,
    method: "wallet",
    name: shortAddress(address),
    email: "",
    walletAddress: address,
  };
}

async function signInWithSolana(provider) {
  try {
    const response = await provider.connect();
    const address = response?.publicKey?.toString?.() || provider.publicKey?.toString?.();
    if (!address) throw new Error("Phantom did not return an account.");
    const signature = await provider.signMessage(
      new TextEncoder().encode(buildMessage(address, "solana")),
      "utf8",
    );
    if (!signature) throw new Error("Phantom did not return a signature.");
    return {
      providerId: `wallet:solana:${address}`,
      method: "wallet",
      name: shortAddress(address),
      email: "",
      walletAddress: address,
    };
  } catch (error) {
    if (error instanceof Error && /did not return an account/.test(error.message)) throw error;
    throw normalizeWalletError(error);
  }
}

export function discoverWallets({ evmOnly = false } = {}) {
  return new Promise((resolve) => {
    const found = new Map();

    function add(wallet) {
      if (!wallet?.id || found.has(wallet.id)) return;
      found.set(wallet.id, wallet);
    }

    function onAnnounce(event) {
      const detail = event?.detail;
      if (!detail?.provider || !detail?.info) return;
      const { info, provider } = detail;
      const name = info.name || "Browser wallet";
      add({
        id: info.uuid || info.rdns || name,
        name,
        icon: safeIcon(info.icon),
        signIn: () => signInWithEvm(provider, name),
      });
    }

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    window.setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);

      if (found.size === 0 && Array.isArray(window.ethereum?.providers)) {
        window.ethereum.providers.forEach((provider, index) => {
          const name = injectedName(provider);
          add({
            id: `evm-${index}-${name}`,
            name,
            icon: "",
            signIn: () => signInWithEvm(provider, name),
          });
        });
      }

      if (found.size === 0 && window.ethereum) {
        const name = injectedName(window.ethereum);
        add({
          id: "injected",
          name,
          icon: "",
          signIn: () => signInWithEvm(window.ethereum, name),
        });
      }

      const solana = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);
      if (!evmOnly && solana) {
        add({
          id: "phantom-solana",
          name: "Phantom (Solana)",
          icon: "",
          signIn: () => signInWithSolana(solana),
        });
      }

      resolve([...found.values()]);
    }, DISCOVERY_MS);
  });
}
