use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::RecessError;
use crate::pricing;
use crate::pyth_price;
use crate::state::{Policy, PolicyStatus, Pool};

#[derive(Accounts)]
#[instruction(notional: u64, threshold_bps: u16, coverage_start_ts: i64)]
pub struct BuyCoverage<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.stock_symbol.as_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// Seeds are [owner, pool, coverage_start_ts], per AGENT.md §5.
    #[account(
        init,
        payer = buyer,
        space = 8 + Policy::INIT_SPACE,
        seeds = [
            buyer.key().as_ref(),
            pool.key().as_ref(),
            &coverage_start_ts.to_le_bytes(),
        ],
        bump,
    )]
    pub policy: Account<'info, Policy>,

    #[account(
        mut,
        constraint = buyer_usdc.mint == pool.usdc_mint,
        constraint = buyer_usdc.owner == buyer.key(),
    )]
    pub buyer_usdc: Account<'info, TokenAccount>,

    #[account(mut, address = pool.vault)]
    pub vault: Account<'info, TokenAccount>,

    /// CHECK: Ignored while `pool.demo_mode` is true. Pass any existing account
    /// in that case. When demo mode is off, this must be a Pyth PriceUpdateV2
    /// for `pool.pyth_feed_id`. DEMO MODE does not read this account.
    pub price_update: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<BuyCoverage>,
    notional: u64,
    threshold_bps: u16,
    coverage_start_ts: i64,
    coverage_end_ts: i64,
) -> Result<()> {
    require!(notional > 0, RecessError::ZeroAmount);
    let clock = Clock::get()?;
    pricing::validate_window(clock.unix_timestamp, coverage_start_ts, coverage_end_ts)?;
    pricing::require_listed_threshold(threshold_bps)?;
    pricing::notional_within_cap(notional, ctx.accounts.vault.amount)?;

    let (tier_bps, premium) = pricing::premium_for(notional, threshold_bps)?;

    let reference_price = if ctx.accounts.pool.demo_mode {
        msg!("DEMO MODE: reference price is the operator demo price, not Pyth.");
        require!(
            ctx.accounts.pool.demo_prices_set,
            RecessError::DemoPricesNotSet
        );
        let price = ctx.accounts.pool.demo_reference_price;
        require!(price > 0, RecessError::InvalidPrice);
        price
    } else {
        pyth_price::read_normalized_price(
            &ctx.accounts.price_update.to_account_info(),
            &ctx.accounts.pool.pyth_feed_id,
            &clock,
        )?
        .price
    };

    let vault_after = ctx
        .accounts
        .vault
        .amount
        .checked_add(premium)
        .ok_or(error!(RecessError::MathOverflow))?;
    let liability_after = ctx
        .accounts
        .pool
        .outstanding_notional
        .checked_add(notional)
        .ok_or(error!(RecessError::MathOverflow))?;
    require!(
        vault_after >= liability_after,
        RecessError::InsufficientPoolLiquidity
    );

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.buyer_usdc.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        premium,
    )?;

    let buyer = ctx.accounts.buyer.key();
    let pool_key = ctx.accounts.pool.key();
    let policy_bump = ctx.bumps.policy;

    let pool = &mut ctx.accounts.pool;
    pool.outstanding_notional = liability_after;
    pool.premiums_collected = pool
        .premiums_collected
        .checked_add(premium)
        .ok_or(error!(RecessError::MathOverflow))?;

    let policy = &mut ctx.accounts.policy;
    policy.owner = buyer;
    policy.pool = pool_key;
    policy.notional = notional;
    policy.threshold_bps = tier_bps;
    policy.premium_paid = premium;
    policy.reference_price = reference_price;
    policy.coverage_start_ts = coverage_start_ts;
    policy.coverage_end_ts = coverage_end_ts;
    policy.status = PolicyStatus::Active;
    policy.payout_amount = 0;
    policy.bump = policy_bump;

    Ok(())
}
