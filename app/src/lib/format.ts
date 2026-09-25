const USDC_DECIMALS = 6;
const PRICE_SCALE = 100_000_000n;

function asBigInt(amount: bigint | number): bigint {
  return typeof amount === "bigint" ? amount : BigInt(Math.trunc(amount));
}

export function formatUsdc(amount: bigint | number): string {
  const value = asBigInt(amount);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(USDC_DECIMALS);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  const text = frac.length > 0 ? `${whole}.${frac}` : `${whole}`;
  return negative ? `-${text}` : text;
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function formatPrice(price: bigint | number): string {
  const value = asBigInt(price);
  const whole = value / PRICE_SCALE;
  const frac = (value % PRICE_SCALE).toString().padStart(8, "0").slice(0, 2);
  return `${whole}.${frac}`;
}

export function toBig(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.length > 0) return BigInt(value);
  if (value && typeof value === "object" && "toString" in value) {
    return BigInt(String(value));
  }
  return 0n;
}

const TIERS: Array<[number, number]> = [
  [200, 400],
  [500, 150],
  [1000, 50],
];

/** Nearest premium tier. Ties snap to the tighter threshold. */
export function premiumFor(notional: bigint, thresholdBps: number): { tierBps: number; premium: bigint } {
  let best = TIERS[0];
  let bestDist = Number.MAX_SAFE_INTEGER;
  for (const tier of TIERS) {
    const dist = Math.abs(thresholdBps - tier[0]);
    if (dist < bestDist) {
      bestDist = dist;
      best = tier;
    }
  }
  return { tierBps: best[0], premium: (notional * BigInt(best[1])) / 10_000n };
}

export function decimalToAtoms(text: string, decimals: number): bigint {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a positive number");
  }
  const [whole, frac = ""] = trimmed.split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export function gapPercent(reference: bigint, settlement: bigint): string {
  if (reference <= 0n || settlement >= reference) return "0.00%";
  const bps = ((reference - settlement) * 10_000n) / reference;
  return `${(Number(bps) / 100).toFixed(2)}%`;
}
