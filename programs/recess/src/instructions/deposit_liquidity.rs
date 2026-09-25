use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::error::RecessError;
use crate::pricing;
use crate::state::{LpPosition, Pool};

#[derive(Accounts)]
pub struct DepositLiquidity<'info> {
    #[account(mut)]
    pub lp: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.stock_symbol.as_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init_if_needed,
        payer = lp,
        space = 8 + LpPosition::INIT_SPACE,
        seeds = [b"lp", pool.key().as_ref(), lp.key().as_ref()],
        bump,
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
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
    require!(amount > 0, RecessError::ZeroAmount);

    let vault_balance = ctx.accounts.vault.amount;
    let total_shares = ctx.accounts.pool.total_lp_shares;
    let minted = pricing::shares_for_deposit(amount, total_shares, vault_balance)?;
    let pool_key = ctx.accounts.pool.key();
    let position_bump = ctx.bumps.lp_position;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.lp_usdc.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.lp.to_account_info(),
            },
        ),
        amount,
    )?;

    let pool = &mut ctx.accounts.pool;
    pool.total_lp_shares = pool
        .total_lp_shares
        .checked_add(minted)
        .ok_or(error!(RecessError::MathOverflow))?;

    let position = &mut ctx.accounts.lp_position;
    if position.owner == Pubkey::default() {
        position.owner = ctx.accounts.lp.key();
        position.pool = pool_key;
        position.bump = position_bump;
    } else {
        require_keys_eq!(position.owner, ctx.accounts.lp.key(), RecessError::Unauthorized);
        require_keys_eq!(position.pool, pool_key, RecessError::Unauthorized);
    }
    position.shares = position
        .shares
        .checked_add(minted)
        .ok_or(error!(RecessError::MathOverflow))?;

    Ok(())
}
