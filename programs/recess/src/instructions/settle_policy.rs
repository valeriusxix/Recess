use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::MAX_PRICE_AGE_SECS;
use crate::error::RecessError;
use crate::pricing;
use crate::pyth_price;
use crate::state::{Policy, PolicyStatus, Pool};

/// Permissionless. The settlement keeper (or the holder) may call this once
/// `coverage_end_ts` has passed. Payout goes to the policy owner.
#[derive(Accounts)]
pub struct SettlePolicy<'info> {
    pub settler: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.stock_symbol.as_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        constraint = policy.pool == pool.key(),
    )]
    pub policy: Account<'info, Policy>,

    #[account(mut, address = pool.vault)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = owner_usdc.mint == pool.usdc_mint,
        constraint = owner_usdc.owner == policy.owner,
    )]
    pub owner_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    /// CHECK: Ignored while `pool.demo_mode` is true. When demo mode is off,
    /// this must be a Pyth PriceUpdateV2 for `pool.pyth_feed_id`.
    /// DEMO MODE does not read this account.
    pub price_update: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<SettlePolicy>) -> Result<()> {
    let clock = Clock::get()?;
    require!(
        ctx.accounts.policy.status == PolicyStatus::Active,
        RecessError::PolicyNotActive
    );
    require!(
        clock.unix_timestamp >= ctx.accounts.policy.coverage_end_ts,
        RecessError::WindowStillOpen
    );

    let settlement_price = if ctx.accounts.pool.demo_mode {
        msg!("DEMO MODE: settlement price is the operator demo price, not Pyth.");
        require!(
            ctx.accounts.pool.demo_prices_set,
            RecessError::DemoPricesNotSet
        );
        ctx.accounts.pool.demo_settlement_price
    } else {
        let quote = pyth_price::read_normalized_price(
            &ctx.accounts.price_update.to_account_info(),
            &ctx.accounts.pool.pyth_feed_id,
            &clock,
        )?;
        let end = ctx.accounts.policy.coverage_end_ts;
        let max_age = i64::try_from(MAX_PRICE_AGE_SECS).map_err(|_| error!(RecessError::MathOverflow))?;
        require!(
            quote.publish_time >= end && quote.publish_time <= end.saturating_add(max_age),
            RecessError::SettlementPriceOutOfWindow
        );
        quote.price
    };

    let notional = ctx.accounts.policy.notional;
    let threshold_bps = ctx.accounts.policy.threshold_bps;
    let reference_price = ctx.accounts.policy.reference_price;
    let vault_available = ctx.accounts.vault.amount;
    let payout = pricing::payout_amount(
        notional,
        threshold_bps,
        reference_price,
        settlement_price,
        vault_available,
    )?;

    let symbol = ctx.accounts.pool.stock_symbol.clone();
    let bump = ctx.accounts.pool.bump;

    ctx.accounts.pool.outstanding_notional = ctx
        .accounts
        .pool
        .outstanding_notional
        .checked_sub(notional)
        .ok_or(error!(RecessError::MathOverflow))?;
    ctx.accounts.policy.status = PolicyStatus::Settled;
    ctx.accounts.policy.payout_amount = payout;

    if payout > 0 {
        let bump_seed = [bump];
        let seeds: &[&[u8]] = &[b"pool", symbol.as_bytes(), &bump_seed];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.owner_usdc.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[seeds],
            ),
            payout,
        )?;
    }

    msg!("Policy settled. payout={}", payout);
    Ok(())
}
