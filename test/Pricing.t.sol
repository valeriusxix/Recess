// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Pricing} from "../src/Pricing.sol";
import {RecessTest} from "./RecessTest.sol";

contract PricingHarness {
    function snap(uint256 thresholdBps) external pure returns (uint256, uint256) {
        return Pricing.snap(thresholdBps);
    }

    function premium(uint256 notional, uint256 thresholdBps) external pure returns (uint256, uint256) {
        return Pricing.premium(notional, thresholdBps);
    }

    function payout(
        uint256 notional,
        uint256 thresholdBps,
        uint256 referencePrice,
        uint256 settlementPrice,
        uint256 vault
    ) external pure returns (uint256) {
        return Pricing.payout(notional, thresholdBps, referencePrice, settlementPrice, vault);
    }
}

contract PricingTest is RecessTest {
    PricingHarness internal harness;

    function setUp() public override {
        harness = new PricingHarness();
    }

    function test_snapTiesKeepTheTighterTier() public view {
        (uint256 snapped350, uint256 premium350) = harness.snap(350);
        assertEq(snapped350, 200);
        assertEq(premium350, 400);

        (uint256 snapped750, uint256 premium750) = harness.snap(750);
        assertEq(snapped750, 500);
        assertEq(premium750, 150);
    }

    function test_premiumOnOneThousandAtFivePercent() public view {
        (uint256 snapped, uint256 premiumAmount) = harness.premium(1000 ether, 500);
        assertEq(snapped, 500);
        assertEq(premiumAmount, 15 ether);
    }

    function test_premiumThatRoundsToZeroReverts() public {
        vm.expectRevert(Pricing.PremiumTooSmall.selector);
        harness.premium(1, 500);
    }

    function test_adverseGapPays() public view {
        uint256 amount = harness.payout(1000 ether, 500, 200e8, 170e8, 10_000 ether);
        assertEq(amount, 100 ether);
    }

    function test_flatOrHigherPrintPaysZero() public view {
        assertEq(harness.payout(1000 ether, 500, 200e8, 200e8, 10_000 ether), 0);
        assertEq(harness.payout(1000 ether, 500, 200e8, 210e8, 10_000 ether), 0);
    }

    function test_gapInsideThresholdPaysZero() public view {
        // 200 -> 192 is a 4% gap, inside a 5% threshold.
        assertEq(harness.payout(1000 ether, 500, 200e8, 192e8, 10_000 ether), 0);
        // Exactly 5% is still inside the threshold.
        assertEq(harness.payout(1000 ether, 500, 200e8, 190e8, 10_000 ether), 0);
    }

    function test_zeroReferencePaysZero() public view {
        assertEq(harness.payout(1000 ether, 200, 0, 0, 10_000 ether), 0);
    }

    function test_totalLossIsCappedByNotionalAndVault() public view {
        uint256 capped = harness.payout(1000 ether, 200, 200e8, 0, 10 ether);
        assertEq(capped, 10 ether);
    }
}
