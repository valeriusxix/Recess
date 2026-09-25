use anchor_lang::prelude::*;
use borsh::BorshDeserialize;
use pythnet_sdk::messages::PriceFeedMessage;

use crate::constants::{MAX_CONFIDENCE_BPS, MAX_FUTURE_PRICE_SKEW_SECS, MAX_PRICE_AGE_SECS};
use crate::error::RecessError;

/// Price scaled to 1e8, plus the Pyth publish time used to bind a window.
pub struct NormalizedPrice {
    pub price: u64,
    pub publish_time: i64,
}

const TARGET_EXPONENT: i32 = -8;

/// Upgraded Pyth Core receiver. Same address on devnet and mainnet.
/// This is not the Pyth Pro program.
pub const PYTH_RECEIVER: Pubkey = pubkey!("rec2HHDDnjLfj4kE7VyEtFA1HPGQLK33259532cRyHp");

/// `sha256("account:PriceUpdateV2")[..8]`, Anchor's account discriminator.
const PRICE_UPDATE_DISC: [u8; 8] = [0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd];

/// Read a Pyth pull-oracle price and scale it to 1e8 fixed-point USD.
///
/// The account must be owned by the upgraded Pyth receiver and contain a
/// fully Wormhole-verified `PriceUpdateV2` for `feed_id`, no older than
/// `MAX_PRICE_AGE_SECS`. Demo mode does not call this function.
///
/// The receiver SDK's `Account<PriceUpdateV2>` helper does not compile against
/// anchor-lang 0.32 (its `solana-program` feature drags in Anchor 1.x). The
/// account layout below is the SDK's layout: discriminator, write authority,
/// verification level, `PriceFeedMessage`, posted slot.
pub fn read_normalized_price(
    price_update: &AccountInfo,
    feed_id: &[u8; 32],
    clock: &Clock,
) -> Result<NormalizedPrice> {
    require_keys_eq!(
        *price_update.owner,
        PYTH_RECEIVER,
        RecessError::StaleOrInvalidPrice
    );
    let data = price_update.try_borrow_data()?;
    let (price, exponent, publish_time) =
        parse_price_update(&data, feed_id, clock.unix_timestamp)?;
    Ok(NormalizedPrice {
        price: normalize_price(price, exponent)?,
        publish_time,
    })
}

/// `now` is a unix timestamp. Exposed for the layout test.
pub fn parse_price_update(data: &[u8], feed_id: &[u8; 32], now: i64) -> Result<(i64, i32, i64)> {
    require!(
        data.len() >= 8 && data[..8] == PRICE_UPDATE_DISC[..],
        RecessError::StaleOrInvalidPrice
    );

    // write_authority: Pubkey
    let mut offset = 8 + 32;
    require!(data.len() > offset, RecessError::StaleOrInvalidPrice);
    // Borsh enum: Partial = 0 followed by num_signatures: u8, Full = 1.
    // Partial verification is rejected. A malicious update only needs a
    // handful of Wormhole signatures on that path.
    let level = data[offset];
    offset += 1;
    require!(level == 1, RecessError::StaleOrInvalidPrice);

    let mut cursor = &data[offset..];
    let message = PriceFeedMessage::deserialize(&mut cursor)
        .map_err(|_| error!(RecessError::StaleOrInvalidPrice))?;
    require!(message.feed_id == *feed_id, RecessError::StaleOrInvalidPrice);
    require!(message.price > 0, RecessError::InvalidPrice);
    require!(
        (message.conf as u128).saturating_mul(10_000)
            <= (message.price as u128).saturating_mul(MAX_CONFIDENCE_BPS),
        RecessError::PriceConfidenceTooWide
    );

    let max_age = i64::try_from(MAX_PRICE_AGE_SECS).map_err(|_| error!(RecessError::MathOverflow))?;
    require!(
        message.publish_time.saturating_add(max_age) >= now,
        RecessError::StaleOrInvalidPrice
    );
    require!(
        message.publish_time <= now.saturating_add(MAX_FUTURE_PRICE_SKEW_SECS),
        RecessError::StaleOrInvalidPrice
    );
    Ok((message.price, message.exponent, message.publish_time))
}

pub fn normalize_price(price: i64, exponent: i32) -> Result<u64> {
    require!(price > 0, RecessError::InvalidPrice);
    let mut value = price as i128;
    let mut expo = exponent;
    // A less-negative exponent has fewer decimal places, so the mantissa
    // has to grow to reach 1e8. The other direction shrinks it.
    while expo > TARGET_EXPONENT {
        value = value
            .checked_mul(10)
            .ok_or(error!(RecessError::MathOverflow))?;
        expo -= 1;
    }
    while expo < TARGET_EXPONENT {
        value /= 10;
        expo += 1;
    }
    require!(value > 0, RecessError::InvalidPrice);
    u64::try_from(value).map_err(|_| error!(RecessError::MathOverflow))
}

#[cfg(test)]
mod tests {
    use super::*;
    use borsh::BorshSerialize;

    fn message(feed: [u8; 32], publish_time: i64) -> PriceFeedMessage {
        PriceFeedMessage {
            feed_id: feed,
            price: 18_050_000,
            conf: 1,
            exponent: -5,
            publish_time,
            prev_publish_time: publish_time - 1,
            ema_price: 18_000_000,
            ema_conf: 1,
        }
    }

    fn account_bytes(feed: [u8; 32], level: u8, publish_time: i64) -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(&PRICE_UPDATE_DISC);
        data.extend_from_slice(&[9u8; 32]);
        data.push(level);
        if level == 0 {
            data.push(5);
        }
        data.extend(message(feed, publish_time).try_to_vec().unwrap());
        data.extend_from_slice(&1u64.to_le_bytes());
        data
    }

    #[test]
    fn full_update_normalizes_the_pyth_exponent_to_1e8() {
        let feed = [4u8; 32];
        let now = 1_700_000_100;
        let (price, exponent, published) =
            parse_price_update(&account_bytes(feed, 1, now), &feed, now).unwrap();
        assert_eq!(published, now);
        // 18050000 * 10^-5 = $180.50, stored at 1e8.
        assert_eq!(normalize_price(price, exponent).unwrap(), 18_050_000_000);
    }

    #[test]
    fn partial_verification_wrong_feed_and_stale_prices_are_rejected() {
        let feed = [4u8; 32];
        let now = 1_700_000_100;
        assert!(parse_price_update(&account_bytes(feed, 0, now), &feed, now).is_err());
        assert!(parse_price_update(&account_bytes([5u8; 32], 1, now), &feed, now).is_err());
        assert!(parse_price_update(&account_bytes(feed, 1, now - 301), &feed, now).is_err());
        assert!(parse_price_update(&account_bytes(feed, 1, now + 61), &feed, now).is_err());
    }

    #[test]
    fn a_wide_confidence_interval_is_rejected() {
        let feed = [4u8; 32];
        let now = 1_700_000_100;
        let mut bytes = account_bytes(feed, 1, now);
        // conf sits after feed_id (32) + price (8) inside PriceFeedMessage.
        let conf_at = 8 + 32 + 1 + 32 + 8;
        bytes[conf_at..conf_at + 8].copy_from_slice(&u64::MAX.to_le_bytes());
        assert!(parse_price_update(&bytes, &feed, now).is_err());
    }
}
