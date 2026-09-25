use anchor_lang::prelude::*;

use crate::error::RecessError;
use crate::state::Pool;

/// One-way switch. After this, buy and settle read Pyth.
/// Open policies must be settled first so their payout terms do not change
/// underneath the buyer.
#[derive(Accounts)]
pub struct DisableDemoMode<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority)]
    pub pool: Account<'info, Pool>,
}

pub fn handler(ctx: Context<DisableDemoMode>) -> Result<()> {
    require!(
        ctx.accounts.pool.demo_mode,
        RecessError::DemoModeAlreadyOff
    );
    require!(
        ctx.accounts.pool.outstanding_notional == 0,
        RecessError::PoliciesStillActive
    );
    ctx.accounts.pool.demo_mode = false;
    msg!("Demo mode is off. Prices now come from Pyth.");
    Ok(())
}
