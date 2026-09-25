use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod pricing;
pub mod pyth_price;
pub mod state;

use instructions::buy_coverage::BuyCoverage;
use instructions::deposit_liquidity::DepositLiquidity;
use instructions::disable_demo_mode::DisableDemoMode;
use instructions::initialize_pool::InitializePool;
use instructions::set_demo_prices::SetDemoPrices;
use instructions::settle_policy::SettlePolicy;
use instructions::withdraw_liquidity::WithdrawLiquidity;

// `#[program]` re-exports these from the crate root. The derives emit them
// next to each accounts struct, so pull them up.
pub(crate) use instructions::buy_coverage::__client_accounts_buy_coverage;
pub(crate) use instructions::deposit_liquidity::__client_accounts_deposit_liquidity;
pub(crate) use instructions::disable_demo_mode::__client_accounts_disable_demo_mode;
pub(crate) use instructions::initialize_pool::__client_accounts_initialize_pool;
pub(crate) use instructions::set_demo_prices::__client_accounts_set_demo_prices;
pub(crate) use instructions::settle_policy::__client_accounts_settle_policy;
pub(crate) use instructions::withdraw_liquidity::__client_accounts_withdraw_liquidity;

declare_id!("DHMDwSXWxcdtRWRrg93KCpCqDFbYNKDnMQUV2MdEbKem");

#[program]
pub mod recess {
    use super::*;

    /// Creates the one pool for a stock and its USDC vault.
    /// Required before the five product instructions can run.
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        stock_symbol: String,
        pyth_feed_id: [u8; 32],
        demo_mode: bool,
    ) -> Result<()> {
        instructions::initialize_pool::handler(ctx, stock_symbol, pyth_feed_id, demo_mode)
    }

    pub fn deposit_liquidity(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
        instructions::deposit_liquidity::handler(ctx, amount)
    }

    pub fn withdraw_liquidity(ctx: Context<WithdrawLiquidity>, shares: u64) -> Result<()> {
        instructions::withdraw_liquidity::handler(ctx, shares)
    }

    pub fn buy_coverage(
        ctx: Context<BuyCoverage>,
        notional: u64,
        threshold_bps: u16,
        coverage_start_ts: i64,
        coverage_end_ts: i64,
    ) -> Result<()> {
        instructions::buy_coverage::handler(
            ctx,
            notional,
            threshold_bps,
            coverage_start_ts,
            coverage_end_ts,
        )
    }

    /// Permissionless once the coverage window has ended.
    pub fn settle_policy(ctx: Context<SettlePolicy>) -> Result<()> {
        instructions::settle_policy::handler(ctx)
    }

    /// One-way. Demo prices stop being used. Open policies must already be settled.
    pub fn disable_demo_mode(ctx: Context<DisableDemoMode>) -> Result<()> {
        instructions::disable_demo_mode::handler(ctx)
    }

    /// DEMO MODE only. Authority-gated. Not a Pyth update.
    pub fn set_demo_prices(
        ctx: Context<SetDemoPrices>,
        reference_price: u64,
        settlement_price: u64,
    ) -> Result<()> {
        instructions::set_demo_prices::handler(ctx, reference_price, settlement_price)
    }
}
