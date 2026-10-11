import assert from "node:assert/strict";
import test from "node:test";
import { payoutOf, premiumOf, snapThreshold } from "./pricing.mjs";

const ether = 10n ** 18n;
const px = (dollars) => BigInt(dollars) * 10n ** 8n;

test("worked examples match the Solidity pricing library", () => {
  assert.equal(snapThreshold(350).thresholdBps, 200);
  assert.equal(snapThreshold(750).thresholdBps, 500);
  assert.equal(premiumOf(1000n * ether, 500).premium, 15n * ether);

  assert.equal(payoutOf({
    notional: 1000n * ether,
    thresholdBps: 500,
    reference: px(200),
    settlement: px(170),
  }), 100n * ether);

  assert.equal(payoutOf({
    notional: 1000n * ether,
    thresholdBps: 500,
    reference: px(200),
    settlement: px(200),
  }), 0n);

  assert.equal(payoutOf({
    notional: 1000n * ether,
    thresholdBps: 500,
    reference: px(200),
    settlement: px(192),
  }), 0n);

  assert.equal(payoutOf({
    notional: 1000n * ether,
    thresholdBps: 200,
    reference: px(200),
    settlement: 0n,
    vault: 10n * ether,
  }), 10n * ether);
});
