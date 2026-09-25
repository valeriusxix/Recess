use anchor_lang::prelude::*;

use crate::constants::{MAX_START_SKEW_SECS, MAX_WINDOW_SECS, NOTIONAL_CAP_DIVISOR};
use crate::error::RecessError;

/// Flat premium table from AGENT.md §7. Ties snap to the earlier, tighter
/// tier (the pool collects the higher premium).
const TIERS: [(u16, u16); 3] = [(200, 400), (500, 150), (1000, 50)];

pub fn snap_tier(threshold_bps: u16) -> (u16, u16) {
    let mut best = TIERS[0];
    let mut best_dist = u16::MAX;
    for tier in TIERS {
        let dist = threshold_bps.abs_diff(tier.0);
        if dist < best_dist {
            best_dist = dist;
            best = tier;
        }
    }
    best
}

/// Buy coverage only accepts the published tiers. Snapping remains for display.
pub fn require_listed_threshold(threshold_bps: u16) -> Result<()> {
    require!(
        matches!(threshold_bps, 200 | 500 | 1000),
        RecessError::ThresholdNotInTable
    );
    Ok(())
}

/// The demo window is a few minutes. A multi-year end would freeze LP withdrawals.
pub fn validate_window(now: i64, start: i64, end: i64) -> Result<()> {
    require!(end > start, RecessError::InvalidWindow);
    require!(end > now, RecessError::WindowAlreadyEnded);
    require!(
        start >= now.saturating_sub(MAX_START_SKEW_SECS),
        RecessError::WindowStartTooOld
    );
    require!(
        end <= start.saturating_add(MAX_WINDOW_SECS),
        RecessError::WindowTooLong
    );
    Ok(())
}

/// One policy cannot reserve more than a quarter of the vault.
pub fn notional_within_cap(notional: u64, vault_balance: u64) -> Result<()> {
    require!(
        (notional as u128).saturating_mul(NOTIONAL_CAP_DIVISOR) <= vault_balance as u128,
        RecessError::NotionalExceedsCap
    );
    Ok(())
}

/// Returns `(snapped_threshold_bps, premium_amount)`.
pub fn premium_for(notional: u64, threshold_bps: u16) -> Result<(u16, u64)> {
    let (tier, premium_bps) = snap_tier(threshold_bps);
    let premium = (notional as u128)
        .checked_mul(premium_bps as u128)
        .ok_or(error!(RecessError::MathOverflow))?
        / 10_000u128;
    let premium = u64::try_from(premium).map_err(|_| error!(RecessError::MathOverflow))?;
    require!(premium > 0, RecessError::PremiumTooSmall);
    Ok((tier, premium))
}

/// Downside gap only.
///
/// gap = max(0, (reference - settlement) / reference)
/// payout = min(vault, notional, notional * max(0, gap - threshold))
pub fn payout_amount(
    notional: u64,
    threshold_bps: u16,
    reference_price: u64,
    settlement_price: u64,
    vault_available: u64,
) -> Result<u64> {
    if reference_price == 0 || settlement_price >= reference_price {
        return Ok(0);
    }
    let gap_bps = (reference_price as u128 - settlement_price as u128) * 10_000u128
        / reference_price as u128;
    if gap_bps <= threshold_bps as u128 {
        return Ok(0);
    }
    let excess_bps = gap_bps - threshold_bps as u128;
    let mut payout = (notional as u128)
        .checked_mul(excess_bps)
        .ok_or(error!(RecessError::MathOverflow))?
        / 10_000u128;
    if payout > notional as u128 {
        payout = notional as u128;
    }
    if payout > vault_available as u128 {
        payout = vault_available as u128;
    }
    Ok(payout as u64)
}

/// The first deposit mints 1 share per atomic USDC unit.
/// Later deposits mint `amount * total_shares / vault_balance`.
/// An empty vault that still has shares is insolvent: minting 1:1 on top of
/// those shares would give the old shareholders the new deposit.
pub fn shares_for_deposit(amount: u64, total_shares: u64, vault_balance: u64) -> Result<u64> {
    if total_shares == 0 {
        return Ok(amount);
    }
    if vault_balance == 0 {
        return err!(RecessError::DepositsDisabledInsolvent);
    }
    let shares = (amount as u128)
        .checked_mul(total_shares as u128)
        .ok_or(error!(RecessError::MathOverflow))?
        / vault_balance as u128;
    let shares = u64::try_from(shares).map_err(|_| error!(RecessError::MathOverflow))?;
    require!(shares > 0, RecessError::ZeroShares);
    Ok(shares)
}

pub fn assets_for_shares(shares: u64, total_shares: u64, vault_balance: u64) -> Result<u64> {
    require!(total_shares > 0, RecessError::ZeroShares);
    let assets = (shares as u128)
        .checked_mul(vault_balance as u128)
        .ok_or(error!(RecessError::MathOverflow))?
        / total_shares as u128;
    let assets = u64::try_from(assets).map_err(|_| error!(RecessError::MathOverflow))?;
    require!(assets > 0, RecessError::ZeroWithdrawal);
    Ok(assets)
}

#[cfg(test)]
mod tests {
    use super::*;

    const USDC: u64 = 1_000_000;
    const PX: u64 = 100_000_000;

    #[test]
    fn premium_tiers_match_the_table() {
        assert_eq!(premium_for(1_000 * USDC, 200).unwrap(), (200, 40 * USDC));
        assert_eq!(premium_for(1_000 * USDC, 500).unwrap(), (500, 15 * USDC));
        assert_eq!(premium_for(1_000 * USDC, 1000).unwrap(), (1000, 5 * USDC));
    }

    #[test]
    fn off_table_thresholds_snap_to_the_nearest_tier() {
        assert_eq!(snap_tier(300).0, 200);
        assert_eq!(snap_tier(400).0, 500);
        assert_eq!(snap_tier(350).0, 200);
        assert_eq!(snap_tier(750).0, 500);
    }

    #[test]
    fn adverse_gap_pays_the_excess_over_the_threshold() {
        // $200 → $170 is a 15% drop. 5% threshold pays 10% of notional.
        let payout = payout_amount(1_000 * USDC, 500, 200 * PX, 170 * PX, u64::MAX).unwrap();
        assert_eq!(payout, 100 * USDC);
    }

    #[test]
    fn flat_or_up_move_pays_nothing() {
        assert_eq!(
            payout_amount(1_000 * USDC, 500, 200 * PX, 200 * PX, u64::MAX).unwrap(),
            0
        );
        assert_eq!(
            payout_amount(1_000 * USDC, 500, 200 * PX, 250 * PX, u64::MAX).unwrap(),
            0
        );
    }

    #[test]
    fn gap_equal_to_the_threshold_pays_nothing() {
        // $200 → $190 is exactly 5%.
        let payout = payout_amount(1_000 * USDC, 500, 200 * PX, 190 * PX, u64::MAX).unwrap();
        assert_eq!(payout, 0);
    }

    #[test]
    fn payout_is_capped_by_notional_and_the_vault() {
        let full = payout_amount(1_000 * USDC, 200, 100 * PX, 0, u64::MAX).unwrap();
        assert_eq!(full, 980 * USDC);
        let starved = payout_amount(1_000 * USDC, 200, 100 * PX, 0, 10 * USDC).unwrap();
        assert_eq!(starved, 10 * USDC);
    }

    #[test]
    fn share_math_bootstraps_then_tracks_the_vault() {
        assert_eq!(shares_for_deposit(100, 0, 0).unwrap(), 100);
        assert_eq!(shares_for_deposit(50, 100, 100).unwrap(), 50);
        assert_eq!(assets_for_shares(100, 100, 150).unwrap(), 150);
        assert!(shares_for_deposit(50, 100, 0).is_err());
    }

    #[test]
    fn windows_and_notionals_stay_inside_the_demo_bounds() {
        let now = 1_700_000_000;
        validate_window(now, now - 120, now + 180).unwrap();
        assert!(validate_window(now, now - 181, now + 30).is_err());
        assert!(validate_window(now, now, now + crate::constants::MAX_WINDOW_SECS + 1).is_err());
        notional_within_cap(1_000 * USDC, 10_000 * USDC).unwrap();
        assert!(notional_within_cap(3_000 * USDC, 10_000 * USDC).is_err());
        require_listed_threshold(500).unwrap();
        assert!(require_listed_threshold(300).is_err());
    }
}
