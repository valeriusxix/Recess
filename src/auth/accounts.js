const ACCOUNTS_KEY = "recess.accounts";
const PASSWORD_ITERATIONS = 210_000;

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeAccounts(accounts) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    throw new Error("This browser could not save the account.");
  }
}

function readAccounts() {
  const raw = storageGet(ACCOUNTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function asString(value) {
  return typeof value === "string" ? value : "";
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function hashPassword(password, saltHex) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations: PASSWORD_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    256,
  );
  return bytesToHex(bits);
}

function safeEqual(left, right) {
  const a = String(left);
  const b = String(right);
  const length = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function versionOf(account) {
  return typeof account?.credentialVersion === "number" && Number.isFinite(account.credentialVersion)
    ? account.credentialVersion
    : 0;
}

export function accountVersion(userId) {
  if (typeof userId !== "string" || userId.length === 0) return null;
  const account = readAccounts().find((item) => item && item.id === userId);
  if (!account) return null;
  return versionOf(account);
}

function publicUser(account) {
  return {
    id: account.id,
    name: account.name,
    email: account.email || "",
    method: account.method,
    walletAddress: account.walletAddress || "",
    credentialVersion: versionOf(account),
  };
}

function requireEmail(email) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Enter a valid email address.");
  }
  return normalized;
}

export async function registerEmailAccount(input) {
  const name = asString(input?.name).trim().replace(/\s+/g, " ");
  const email = requireEmail(input?.email);
  const password = asString(input?.password);

  if (!name) throw new Error("Enter your name.");
  if (name.length > 80) throw new Error("Name must be 80 characters or fewer.");
  if (password.length < 8) throw new Error("Use at least 8 characters.");
  if (password.length > 200) throw new Error("Password must be 200 characters or fewer.");

  const accounts = readAccounts();
  const existing = accounts.find((account) => account.email === email);
  if (existing?.method === "google") {
    throw new Error("This email is already registered with Google. Use Google to sign in.");
  }
  if (existing) {
    throw new Error("An account with this email already exists. Sign in instead.");
  }

  const passwordSalt = randomSalt();
  const passwordHash = await hashPassword(password, passwordSalt);
  const account = {
    id: crypto.randomUUID(),
    providerId: `email:${email}`,
    method: "email",
    name,
    email,
    walletAddress: "",
    passwordSalt,
    passwordHash,
    createdAt: Date.now(),
  };
  accounts.push(account);
  writeAccounts(accounts);
  return publicUser(account);
}

export async function signInEmailAccount(input) {
  const email = normalizeEmail(input?.email);
  const password = asString(input?.password);
  if (password.length > 200) {
    throw new Error("Email or password is incorrect.");
  }
  const accounts = readAccounts();
  const account = accounts.find((item) => item.method === "email" && item.email === email);
  const salt = account?.passwordSalt || "00".repeat(16);
  const candidate = await hashPassword(password, salt);
  const matches = account ? safeEqual(candidate, account.passwordHash) : false;

  if (!account || !matches) {
    throw new Error("Email or password is incorrect.");
  }

  return publicUser(account);
}

export async function resetEmailPassword(input) {
  const email = requireEmail(input?.email);
  const password = asString(input?.password);
  if (password.length < 8) throw new Error("Use at least 8 characters.");
  if (password.length > 200) throw new Error("Password must be 200 characters or fewer.");

  const accounts = readAccounts();
  const index = accounts.findIndex((account) => account.method === "email" && account.email === email);
  if (index < 0) {
    const googleAccount = accounts.find((account) => account.method === "google" && account.email === email);
    if (googleAccount) {
      throw new Error("This email uses Google. Continue with Google to sign in.");
    }
    throw new Error("We couldn't find an account with that email.");
  }

  const passwordSalt = randomSalt();
  const passwordHash = await hashPassword(password, passwordSalt);
  accounts[index] = {
    ...accounts[index],
    passwordSalt,
    passwordHash,
    credentialVersion: versionOf(accounts[index]) + 1,
  };
  writeAccounts(accounts);
}

export function saveProviderAccount(profile) {
  if (!profile?.providerId || !profile?.name || !profile?.method) {
    throw new Error("The sign-in response was missing account details.");
  }

  const accounts = readAccounts();
  const index = accounts.findIndex((account) => account.providerId === profile.providerId);
  if (index >= 0) {
    const next = {
      ...accounts[index],
      name: profile.name,
      email: profile.email || accounts[index].email || "",
      walletAddress: profile.walletAddress || accounts[index].walletAddress || "",
    };
    accounts[index] = next;
    writeAccounts(accounts);
    return publicUser(next);
  }

  const created = {
    id: crypto.randomUUID(),
    providerId: profile.providerId,
    method: profile.method,
    name: profile.name,
    email: profile.email || "",
    walletAddress: profile.walletAddress || "",
    createdAt: Date.now(),
  };
  accounts.push(created);
  writeAccounts(accounts);
  return publicUser(created);
}
