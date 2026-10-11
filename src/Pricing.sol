// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Flat weekend-gap premium table. Ties keep the earlier, tighter tier.
library Pricing {
    error PremiumTooSmall();
    error DepositsDisabledInsolvent();

    uint256 internal constant BPS = 10_000;

    function snap(uint256 thresholdBps) internal pure returns (uint256 snapped, uint256 premiumBps) {
        uint256 distance200 = _distance(thresholdBps, 200);
        uint256 distance500 = _distance(thresholdBps, 500);
        uint256 distance1000 = _distance(thresholdBps, 1000);
        if (distance200 <= distance500 && distance200 <= distance1000) return (200, 400);
        if (distance500 <= distance1000) return (500, 150);
        return (1000, 50);
    }

    function premium(uint256 notional, uint256 thresholdBps)
        internal
        pure
        returns (uint256 snapped, uint256 premiumAmount)
    {
        uint256 premiumBps;
        (snapped, premiumBps) = snap(thresholdBps);
        premiumAmount = (notional * premiumBps) / BPS;
        if (premiumAmount == 0) revert PremiumTooSmall();
    }

    /// @dev Prices are 8-decimal USD. A zero reference, a flat or higher settlement, or a gap
    /// inside the threshold (including an exact match) pays 0. The result is also capped at notional and vault.
    function payout(
        uint256 notional,
        uint256 thresholdBps,
        uint256 referencePrice,
        uint256 settlementPrice,
        uint256 vault
    ) internal pure returns (uint256 amount) {
        if (referencePrice == 0 || settlementPrice >= referencePrice) return 0;
        uint256 gapBps = ((referencePrice - settlementPrice) * BPS) / referencePrice;
        if (gapBps <= thresholdBps) return 0;
        amount = (notional * (gapBps - thresholdBps)) / BPS;
        if (amount > notional) amount = notional;
        if (amount > vault) amount = vault;
    }

    function _distance(uint256 left, uint256 right) private pure returns (uint256) {
        return left > right ? left - right : right - left;
    }
}
