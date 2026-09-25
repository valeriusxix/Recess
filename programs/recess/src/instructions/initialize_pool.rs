use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::error::RecessError;
use crate::state::Pool;

#[derive(Accounts)]
#[instruction(stock_symbol: String)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", stock_symbol.as_bytes()],
        bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = authority,
        seeds = [b"vault", stock_symbol.as_bytes()],
        bump,
        token::mint = usdc_mint,
        token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitializePool>,
    stock_symbol: String,
    pyth_feed_id: [u8; 32],
    demo_mode: bool,
) -> Result<()> {
    require!(
        (1..=8).contains(&stock_symbol.len())
            && stock_symbol.bytes().all(|b| b.is_ascii_alphanumeric()),
        RecessError::InvalidSymbol
    );
    require!(
        pyth_feed_id.iter().any(|byte| *byte != 0),
        RecessError::InvalidFeedId
    );
    require!(
        ctx.accounts.usdc_mint.decimals == 6,
        RecessError::MintDecimalsMustBeSix
    );

    let pool = &mut ctx.accounts.pool;
    pool.authority = ctx.accounts.authority.key();
    pool.stock_symbol = stock_symbol;
    pool.pyth_feed_id = pyth_feed_id;
    pool.usdc_mint = ctx.accounts.usdc_mint.key();
    pool.vault = ctx.accounts.vault.key();
    pool.total_lp_shares = 0;
    pool.outstanding_notional = 0;
    pool.premiums_collected = 0;
    pool.demo_mode = demo_mode;
    pool.demo_prices_set = false;
    pool.demo_reference_price = 0;
    pool.demo_settlement_price = 0;
    pool.bump = ctx.bumps.pool;
    pool.vault_bump = ctx.bumps.vault;

    if demo_mode {
        msg!("DEMO MODE is on. set_demo_prices replaces Pyth for this pool.");
    }
    Ok(())
}
