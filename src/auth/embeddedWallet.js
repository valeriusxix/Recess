/** One in-flight creation shared by automatic login and the manual fallback. */
let creatingEmbeddedWallet = false;

export function findEmbeddedWallet(user) {
  const accounts = user?.linkedAccounts;
  if (!Array.isArray(accounts)) return null;
  const wallets = accounts.filter(
    (account) => account?.type === "wallet" && account.walletClientType === "privy",
  );
  return wallets.find((account) => account.chainType === "ethereum") || wallets[0] || null;
}

export function isEmailOrGoogleLogin(loginMethod) {
  return loginMethod === "email" || loginMethod === "google";
}

export function isEmailOrGoogleUser(user) {
  const accounts = user?.linkedAccounts;
  if (!Array.isArray(accounts)) return false;
  return accounts.some((account) => account?.type === "email" || account?.type === "google_oauth");
}

function shouldCreateWallet(user, loginMethod) {
  if (!isEmailOrGoogleLogin(loginMethod)) return false;
  return !findEmbeddedWallet(user);
}

/**
 * Create the user's embedded wallet only when this login is email or Google
 * and the latest user still has none. A second caller, or a wallet that
 * appeared while the first call was waiting, does not create another.
 */
export async function ensureEmbeddedWallet(getUser, createWallet, loginMethod) {
  if (creatingEmbeddedWallet) return false;
  if (!shouldCreateWallet(getUser(), loginMethod)) return false;

  creatingEmbeddedWallet = true;
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!shouldCreateWallet(getUser(), loginMethod)) return false;
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    }
    if (!shouldCreateWallet(getUser(), loginMethod)) return false;
    await createWallet();
    return true;
  } catch (error) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (findEmbeddedWallet(getUser())) return false;
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
    }
    if (findEmbeddedWallet(getUser())) return false;
    throw error;
  } finally {
    creatingEmbeddedWallet = false;
  }
}
