use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::RecessError;
use crate::pricing;
use crate::state::{LpPosition, Pool};

#[derive(Accounts)]
pub struct WithdrawLiquidity<'info> {
    #[account(mut)]
    pub lp: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.stock_symbol.as_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"lp", pool.key().as_ref(), lp.key().as_ref()],
        bump = lp_position.bump,
    )]
    pub lp_position: Account<'info, LpPosition>,

    #[account(
        mut,
        constraint = lp_usdc.mint == pool.usdc_mint,
        constraint = lp_usdc.owner == lp.key(),
    )]
    pub lp_usdc: Account<'info, TokenAccount>,

    #[account(mut, address = pool.vault)]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<WithdrawLiquidity>, shares: u64) -> Result<()> {
    require!(shares > 0, RecessError::ZeroAmount);
    require!(
        ctx.accounts.lp_position.shares >= shares,
        RecessError::InsufficientShares
    );

    let vault_balance = ctx.accounts.vault.amount;
    let total_shares = ctx.accounts.pool.total_lp_shares;
    let outstanding = ctx.accounts.pool.outstanding_notional;
    // The final shareholder receives the rounding remainder.
    let assets = if shares == total_shares {
        vault_balance
    } else {
        pricing::assets_for_shares(shares, total_shares, vault_balance)?
    };
    require!(assets > 0, RecessError::ZeroWithdrawal);
    let vault_after = vault_balance
        .checked_sub(assets)
        .ok_or(error!(RecessError::MathOverflow))?;
    // AGENT.md §6: a withdrawal cannot drop the vault below outstanding notionals.
    require!(
        vault_after >= outstanding,
        RecessError::WithdrawalWouldStarvePayouts
    );

    let symbol = ctx.accounts.pool.stock_symbol.clone();
    let bump = ctx.accounts.pool.bump;
    let bump_seed = [bump];
    let seeds: &[&[u8]] = &[b"pool", symbol.as_bytes(), &bump_seed];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.lp_usdc.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            &[seeds],
        ),
        assets,
    )?;

    ctx.accounts.pool.total_lp_shares = total_shares
        .checked_sub(shares)
        .ok_or(error!(RecessError::MathOverflow))?;
    ctx.accounts.lp_position.shares = ctx
        .accounts
        .lp_position
        .shares
        .checked_sub(shares)
        .ok_or(error!(RecessError::MathOverflow))?;

    Ok(())
}
