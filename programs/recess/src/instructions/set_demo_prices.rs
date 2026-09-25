use anchor_lang::prelude::*;

use crate::error::RecessError;
use crate::state::Pool;

/// DEMO MODE ONLY.
///
/// Authority-gated, and rejected unless `pool.demo_mode` is true.
/// The two prices written here are NOT from Pyth. buy_coverage and
/// settle_policy use them so a judge can force a weekend gap on demand.
/// The UI must show a visible DEMO MODE badge whenever this path can run.
#[derive(Accounts)]
pub struct SetDemoPrices<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = authority)]
    pub pool: Account<'info, Pool>,
}

pub fn handler(
    ctx: Context<SetDemoPrices>,
    reference_price: u64,
    settlement_price: u64,
) -> Result<()> {
    require!(ctx.accounts.pool.demo_mode, RecessError::DemoModeDisabled);
    require!(reference_price > 0, RecessError::InvalidPrice);

    let pool = &mut ctx.accounts.pool;
    pool.demo_reference_price = reference_price;
    pool.demo_settlement_price = settlement_price;
    pool.demo_prices_set = true;

    msg!(
        "DEMO MODE prices set. These are NOT Pyth. reference={} settlement={}",
        reference_price,
        settlement_price
    );
    Ok(())
}
