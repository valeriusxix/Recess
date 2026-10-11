import { accountVersion } from "./accounts";

/** Inactivity limit. A visit inside this window keeps the session. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Hard stop even when the tab keeps refreshing the idle timer. */
export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;

export const SESSION_KEY = "recess.session";

function storageGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function storageRemove(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    // Storage can be blocked in private mode. The in-memory session still clears.
  }
}

function persistentStore() {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function tabStore() {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

function isSession(value) {
  if (!value || typeof value !== "object") return false;
  const user = value.user;
  if (!user || typeof user !== "object") return false;
  if (typeof user.id !== "string" || user.id.length === 0) return false;
  if (typeof user.name !== "string" || user.name.length === 0) return false;
  if (typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) return false;
  if (typeof value.lastSeenAt !== "number" || !Number.isFinite(value.lastSeenAt)) return false;
  return true;
}

export function readStoredSession(raw, now) {
  if (!raw) return { state: "missing" };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: "invalid" };
  }

  if (!isSession(parsed)) return { state: "invalid" };
  if (now - parsed.createdAt >= SESSION_ABSOLUTE_MS) return { state: "expired" };
  if (now - parsed.lastSeenAt >= SESSION_TTL_MS) return { state: "expired" };
  const storedVersion = accountVersion(parsed.user.id);
  const sessionVersion = parsed.user.credentialVersion || 0;
  if (storedVersion == null || storedVersion !== sessionVersion) return { state: "invalid" };
  return { state: "valid", session: parsed };
}

function readStore(storage, now) {
  if (!storage) return { state: "missing" };
  const result = readStoredSession(storageGet(storage, SESSION_KEY), now);
  if (result.state === "expired" || result.state === "invalid") {
    storageRemove(storage, SESSION_KEY);
  }
  return result;
}

function writeStore(storage, session) {
  if (!storage) return false;
  return storageSet(storage, SESSION_KEY, JSON.stringify(session));
}

function currentSession(now) {
  const persistent = persistentStore();
  const tab = tabStore();
  const remembered = readStore(persistent, now);
  if (remembered.state === "valid") {
    if (tab) storageRemove(tab, SESSION_KEY);
    return { storage: persistent, session: remembered.session };
  }

  const temporary = readStore(tab, now);
  if (temporary.state === "valid") {
    return { storage: tab, session: temporary.session };
  }

  return null;
}

export function peekSession(now = Date.now()) {
  return currentSession(now)?.session ?? null;
}

export function loadSession(now = Date.now()) {
  const current = currentSession(now);
  if (!current) return null;

  const next = { ...current.session, lastSeenAt: now };
  if (!writeStore(current.storage, next)) return current.session;
  return next;
}

export function startSession(user, now = Date.now(), options = {}) {
  const remember = options.remember !== false;
  const session = { user, createdAt: now, lastSeenAt: now, remember };
  const persistent = persistentStore();
  const tab = tabStore();
  const target = remember ? persistent : tab;
  const other = remember ? tab : persistent;

  if (other) storageRemove(other, SESSION_KEY);
  if (!target || !writeStore(target, session)) {
    throw new Error("This browser could not save your session.");
  }
  return session;
}

export function touchSession(now = Date.now()) {
  const current = currentSession(now);
  if (!current) return null;

  const next = { ...current.session, lastSeenAt: now };
  if (!writeStore(current.storage, next)) return current.session;
  return next;
}

export function clearSession() {
  const persistent = persistentStore();
  const tab = tabStore();
  if (persistent) storageRemove(persistent, SESSION_KEY);
  if (tab) storageRemove(tab, SESSION_KEY);
}
