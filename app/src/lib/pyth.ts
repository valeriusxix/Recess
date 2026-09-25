/** Equity.US.TSLA/USD on Pyth Core. Confirmed 2026-09-25 via Pyth symbology. */
export const TSLA_SYMBOL = "TSLA";
export const TSLA_PYTH_SYMBOL = "Equity.US.TSLA/USD";
export const TSLA_FEED_ID =
  "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1";

/**
 * Upgraded Pyth Core receiver. Same program id on devnet and mainnet.
 * This is not the Pyth Pro program.
 */
export const PYTH_RECEIVER = "rec2HHDDnjLfj4kE7VyEtFA1HPGQLK33259532cRyHp";

/** Hermes has required an API key since August 26, 2026. */
export const HERMES_URL = "https://hermes.pyth.network";

/** Same id the on-chain parser expects, with the 0x prefix Pyth's client uses. */
export const TSLA_FEED_ID_0X = `0x${TSLA_FEED_ID}`;

export type HermesPrice = {
  price: bigint;
  exponent: number;
  publishTime: number;
};

export async function fetchHermesPrice(apiKey?: string): Promise<HermesPrice | null> {
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const url = `${HERMES_URL}/v2/updates/price/latest?ids[]=${TSLA_FEED_ID}&parsed=true`;
  const response = await fetch(url, { headers });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    parsed?: Array<{ price?: { price?: string; expo?: number; publish_time?: number } }>;
  };
  const price = body.parsed?.[0]?.price;
  if (!price?.price || price.expo === undefined) return null;
  return {
    price: BigInt(price.price),
    exponent: price.expo,
    publishTime: price.publish_time ?? 0,
  };
}

/** Scale a Pyth mantissa to the 1e8 fixed point the program stores. */
export function normalizeHermesPrice(price: bigint, exponent: number): bigint {
  let value = price;
  let expo = exponent;
  // A less-negative exponent has fewer decimal places, so the mantissa grows.
  while (expo > -8) {
    value *= 10n;
    expo -= 1;
  }
  while (expo < -8) {
    value /= 10n;
    expo += 1;
  }
  return value;
}

export async function fetchHermesUpdate(apiKey: string): Promise<string[]> {
  const key = apiKey.trim();
  if (!key) {
    throw new Error("Set VITE_PYTH_API_KEY or PYTH_API_KEY. Hermes will not return a price without one.");
  }
  const response = await fetch(`${HERMES_URL}/v2/updates/price/latest?ids[]=${TSLA_FEED_ID}&encoding=base64`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    throw new Error(`Hermes rejected the price request (${response.status}). Check the Pyth API key.`);
  }
  const body = (await response.json()) as { binary?: { data?: string[] } };
  const data = body.binary?.data;
  if (!data || data.length === 0) {
    throw new Error("Hermes did not return a price update.");
  }
  return data;
}
