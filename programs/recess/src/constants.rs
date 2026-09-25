/// Equity.US.TSLA/USD on Pyth Core.
/// Confirmed 2026-09-25 against Pyth's symbology API
/// (`GET https://pyth.dourolabs.app/v1/symbols?query=TSLA`):
/// symbol `Equity.US.TSLA/USD`, description "TESLA INC / US DOLLAR",
/// nasdaq_symbol TSLA, state stable, pyth_lazer_id 1435, exponent -5.
/// `hermes_id` below is the Core feed id. Regular NYSE session only —
/// not the inactive extended-hours feed and not the tokenized xStock.
pub const TSLA_FEED_ID_HEX: &str =
    "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1";

pub const TSLA_FEED_ID: [u8; 32] = [
    0x16, 0xda, 0xd5, 0x06, 0xd7, 0xdb, 0x8d, 0xa0, 0x1c, 0x87, 0x58, 0x1c, 0x87, 0xca, 0x89, 0x7a,
    0x01, 0x2a, 0x15, 0x35, 0x57, 0xd4, 0xd5, 0x78, 0xc3, 0xb9, 0xc9, 0xe1, 0xbc, 0x06, 0x32, 0xf1,
];

/// Prices are stored as fixed-point USD with 8 decimal places (1e8 = $1).
pub const PRICE_SCALE: u64 = 100_000_000;

/// Equity prints can pause for a few minutes around the open. The real Pyth
/// path rejects anything older than this. Demo mode does not consult it.
pub const MAX_PRICE_AGE_SECS: u64 = 300;

/// A Pyth publish time may sit this far ahead of the cluster clock.
pub const MAX_FUTURE_PRICE_SKEW_SECS: i64 = 60;

/// Confidence wider than this fraction of the price is rejected. 2_000 = 20%.
pub const MAX_CONFIDENCE_BPS: u128 = 2_000;

/// Coverage may start this many seconds before the buy transaction.
pub const MAX_START_SKEW_SECS: i64 = 180;

/// Longest coverage window. The demo uses a few minutes.
pub const MAX_WINDOW_SECS: i64 = 14 * 24 * 60 * 60;

/// A single policy can reserve at most this fraction of the vault. 4 = 25%.
pub const NOTIONAL_CAP_DIVISOR: u128 = 4;
