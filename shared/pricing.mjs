// Flat premium table. Keep the worked examples aligned with src/Pricing.sol.
export const TIERS = [
  { thresholdBps: 200, premiumBps: 400 },
  { thresholdBps: 500, premiumBps: 150 },
  { thresholdBps: 1000, premiumBps: 50 },
];

export function snapThreshold(bps) {
  const target = Number(bps);
  let best = TIERS[0];
  let bestDistance = Math.abs(TIERS[0].thresholdBps - target);
  for (const tier of TIERS.slice(1)) {
    const distance = Math.abs(tier.thresholdBps - target);
    if (distance < bestDistance) {
      best = tier;
      bestDistance = distance;
    }
  }
  return best;
}

export function premiumOf(notional, thresholdBps) {
  const tier = snapThreshold(thresholdBps);
  const premium = (notional * BigInt(tier.premiumBps)) / 10000n;
  return { tier, premium, tooSmall: premium === 0n };
}

export function gapBps(reference, settlement) {
  if (reference <= 0n || settlement >= reference) return 0n;
  return ((reference - settlement) * 10000n) / reference;
}

export function payoutOf({ notional, thresholdBps, reference, settlement, vault = null }) {
  const tier = snapThreshold(thresholdBps);
  if (reference <= 0n || settlement >= reference) return 0n;
  const gap = gapBps(reference, settlement);
  if (gap <= BigInt(tier.thresholdBps)) return 0n;
  let payout = (notional * (gap - BigInt(tier.thresholdBps))) / 10000n;
  if (payout > notional) payout = notional;
  if (vault != null && payout > vault) payout = vault;
  return payout;
}

export const HUNDRED_USDT = 100n * 10n ** 18n;
