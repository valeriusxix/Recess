# Recess

Weekend and overnight gap insurance for tokenized stocks on Solana. Tokenized
equities trade 24/7, but the NYSE does not. A holder can wake up Monday to a
price that gapped hard against them, and no brokerage app offers weekend
protection either. Recess lets that holder pay a small premium before a
coverage window and get paid automatically if Pyth's price for the stock gaps
down past their threshold when the window ends.

The contract is parametric. The buyer declares a notional and a stock, pays a
premium in USDC, and the payout is computed from the oracle price at the start
of the window versus the price at the end. The buyer does not deposit or lock
the tokenized stock.

## Flow

1. A liquidity provider deposits USDC into the pool and receives shares.
2. A buyer picks TSLA, a notional, and a downside threshold (2%, 5%, or 10%),
   sees the premium, and buys coverage.
3. After the window ends, anyone can settle the policy. If the price dropped
   by more than the threshold, the pool pays the excess, capped at the notional.
   A flat or up move pays nothing.
4. The LP can withdraw shares as long as the vault still covers open notionals.

Demo mode is fixed when the pool is created. The pool authority can call
`set_demo_prices` to force a gap for a live demo. The app shows a DEMO MODE
badge whenever that path is active. Those prices are not Pyth.

## Architecture

- Solana program: Anchor (`programs/recess`), devnet.
- Prices: Pyth Core feed `Equity.US.TSLA/USD`
  (`16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1`),
  read from a `PriceUpdateV2` account owned by the upgraded Pyth receiver
  `rec2HHDDnjLfj4kE7VyEtFA1HPGQLK33259532cRyHp`.
- Frontend: Vite, React, TypeScript, the Solana wallet adapter (`app/`).
- Settlement: `scripts/settle-cron.ts`, runnable by hand for the demo.

Premiums are a flat table, not a volatility surface:

| Threshold | Premium of notional |
| --- | --- |
| 2% (200 bps) | 4% (400 bps) |
| 5% (500 bps) | 1.5% (150 bps) |
| 10% (1000 bps) | 0.5% (50 bps) |

An off-table threshold snaps to the nearest tier. An exact tie snaps to the
tighter tier.

## Why Solana

Tokenized stocks on Solana trade through the weekend. Settlement has to be
able to move USDC the moment an onchain oracle prints the reopen price, with
no brokerage batch window in the middle. A traditional brokerage app cannot
offer that, because it is closed when the gap happens and it cannot pay from
a shared onchain pool against a public price.

## This is a devnet demo

The program and app target Solana devnet. Mainnet deployment needs a reviewed
audit, a real USDC mint, a keeper that posts fresh Pyth updates and settles
policies at the reopen, key management for the pool authority, and enough
liquidity that a gap cannot drain the vault. Demo mode must be off.

## What's next

- A volatility-surface pricing model instead of the flat tier table.
- More than one stock.
- Upside-gap coverage.
- A Meteora DBC premium curve.

## Open source

This repository is open source for the Stocklana hackathon. The program,
tests, scripts, and frontend in this repo may be used, modified, and
redistributed under the terms of the MIT license.

## Build

Program id: `DHMDwSXWxcdtRWRrg93KCpCqDFbYNKDnMQUV2MdEbKem`.

Solana CLI 2.3.0 and Anchor CLI 0.32.1.

```
anchor build
anchor test
npm install --prefix app
npm run dev
```

`npm run dev` starts the app in `app/` on Solana devnet. Settle policies whose window has ended (the payer wallet signs):

```
npm run settle
```

`RECESS_SYMBOL` defaults to `TSLA`. Outside demo mode the keeper posts a Pyth update itself. Set `PYTH_API_KEY` in `app/.env`. `PRICE_UPDATE` still overrides that with an existing account.

The app stays on devnet. The navbar has a Mainnet control, and choosing it shows “Live not available- Coming Soon” until that switch is enabled. Put the Hermes trial key in `app/.env` as `VITE_PYTH_API_KEY` and `PYTH_API_KEY`. A live pool has to be created with demo mode unchecked. Buys then post a Pyth update and cover Friday 4:00pm ET through Monday 9:30am ET. Settlement has to land in the five minutes after that Monday open.

On Windows, `solana-test-validator` stops when it creates a snapshot symlink unless Developer Mode is on. `npm run test:local` starts the validator with `--log` and `--ticks-per-slot 400`, loads `target/deploy/recess.so` at genesis, and runs the same suite. On this machine that binary was produced with platform-tools v1.54 and `cargo build --target sbpf-solana-solana -Z build-std=std,panic_abort`, because `cargo-build-sbf` wants platform-tools v1.48, whose cargo cannot parse the current lockfile.
