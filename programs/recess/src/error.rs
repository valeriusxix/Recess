use anchor_lang::prelude::*;

#[error_code]
pub enum RecessError {
    #[msg("Stock symbol must be 1-8 ASCII alphanumeric characters")]
    InvalidSymbol,
    #[msg("Pyth feed id is empty")]
    InvalidFeedId,
    #[msg("USDC mint must have 6 decimals")]
    MintDecimalsMustBeSix,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Deposit would mint zero shares")]
    ZeroShares,
    #[msg("Withdrawal would return zero USDC")]
    ZeroWithdrawal,
    #[msg("Not enough LP shares")]
    InsufficientShares,
    #[msg("Withdrawal would leave the vault below outstanding policy notionals")]
    WithdrawalWouldStarvePayouts,
    #[msg("Coverage window end must be after the start")]
    InvalidWindow,
    #[msg("Coverage window has already ended")]
    WindowAlreadyEnded,
    #[msg("Coverage window has not ended yet")]
    WindowStillOpen,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Premium rounds to zero; increase the notional")]
    PremiumTooSmall,
    #[msg("Pool cannot cover this notional")]
    InsufficientPoolLiquidity,
    #[msg("Demo prices can only be set while demo mode is on")]
    DemoModeDisabled,
    #[msg("Set demo prices before buying or settling in demo mode")]
    DemoPricesNotSet,
    #[msg("Price must be greater than zero")]
    InvalidPrice,
    #[msg("Pyth price is missing, stale, or for a different feed")]
    StaleOrInvalidPrice,
    #[msg("Policy is not active")]
    PolicyNotActive,
    #[msg("Account owner does not match this pool")]
    Unauthorized,
    #[msg("Coverage window start is too far in the past")]
    WindowStartTooOld,
    #[msg("Coverage window is longer than 14 days")]
    WindowTooLong,
    #[msg("Notional exceeds 25% of the vault")]
    NotionalExceedsCap,
    #[msg("Threshold must be 2%, 5%, or 10%")]
    ThresholdNotInTable,
    #[msg("Vault is empty while LP shares are still outstanding")]
    DepositsDisabledInsolvent,
    #[msg("Pyth confidence interval is too wide")]
    PriceConfidenceTooWide,
    #[msg("Settlement price is outside the coverage end window")]
    SettlementPriceOutOfWindow,
    #[msg("Demo mode is already off")]
    DemoModeAlreadyOff,
    #[msg("Settle open policies before turning demo mode off")]
    PoliciesStillActive,
}
