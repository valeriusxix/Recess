const SCALE = 10n ** 18n;

export function parseUsdt(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{1,12}(\.\d{0,18})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const padded = `${frac}${"0".repeat(18)}`.slice(0, 18);
  return BigInt(whole) * SCALE + BigInt(padded || "0");
}

export function formatUsdt(amount) {
  if (typeof amount !== "bigint") return "";
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const whole = abs / SCALE;
  let frac = (abs % SCALE).toString().padStart(18, "0").slice(0, 4);
  frac = frac.replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${frac}`;
}

export function formatThreshold(bps) {
  return `${bps / 100}%`;
}

export function dollarToUsd8(value) {
  const parsed = parseUsdt(value);
  if (parsed == null) return null;
  return parsed / 10n ** 10n;
}

export function formatUsd8(amount) {
  if (typeof amount !== "bigint") return "";
  const scale = 10n ** 8n;
  const whole = amount / scale;
  let frac = (amount % scale).toString().padStart(8, "0").replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0");
  return `${whole.toString()}.${frac}`;
}

export function ratioPercent(part, whole) {
  if (typeof part !== "bigint" || typeof whole !== "bigint" || whole === 0n) return "—";
  const scaled = (part * 10000n) / whole;
  const digits = scaled / 100n;
  const frac = (scaled % 100n).toString().padStart(2, "0");
  return `${digits.toString()}.${frac}%`;
}

export function formatWhen(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
