use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub authority: Pubkey,
    #[max_len(8)]
    pub stock_symbol: String,
    /// Pyth Core feed id (32 bytes), not a Solana account address.
    pub pyth_feed_id: [u8; 32],
    /// 6-decimal mint the vault holds. Tests use a local mint; devnet can use USDC.
    pub usdc_mint: Pubkey,
    pub vault: Pubkey,
    pub total_lp_shares: u64,
    /// Sum of notionals on Active policies. Withdrawals cannot push the vault
    /// below this, so a payout cannot be starved. Maintained here because the
    /// program cannot iterate every policy account.
    pub outstanding_notional: u64,
    /// Cumulative premiums paid in. The liquidity page uses this for a simple APY.
    pub premiums_collected: u64,
    /// When true, buy/settle read set_demo_prices instead of Pyth.
    /// Fixed at initialize. There is no toggle instruction.
    pub demo_mode: bool,
    pub demo_prices_set: bool,
    /// DEMO MODE only. Operator-supplied reference, 1e8 fixed point.
    pub demo_reference_price: u64,
    /// DEMO MODE only. Operator-supplied settlement price, 1e8 fixed point.
    pub demo_settlement_price: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

/// Per-LP share balance. The pool only stores the total, so withdraw needs
/// this account to burn the caller's shares and nobody else's.
#[account]
#[derive(InitSpace)]
pub struct LpPosition {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub shares: u64,
    pub bump: u8,
}

/// PDA seeds: [owner, pool, coverage_start_ts] as specified in AGENT.md §5.
#[account]
#[derive(InitSpace)]
pub struct Policy {
    pub owner: Pubkey,
    pub pool: Pubkey,
    /// USDC notional, 6 decimals.
    pub notional: u64,
    /// Snapped to the premium tier table. 500 = 5%.
    pub threshold_bps: u16,
    pub premium_paid: u64,
    /// Captured at buy_coverage. 1e8 fixed-point USD.
    pub reference_price: u64,
    pub coverage_start_ts: i64,
    pub coverage_end_ts: i64,
    pub status: PolicyStatus,
    pub payout_amount: u64,
    pub bump: u8,
}

/// `Expired` is part of the data model. v1 only transitions Active → Settled.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum PolicyStatus {
    Active,
    Settled,
    Expired,
}
