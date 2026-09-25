# AGENT.md — Recess

Build instructions for an LLM coding agent. Follow this document as the source
of truth. Where something is ambiguous, prefer the simplest version that still
produces a working, demoable end-to-end product by the deadline below.

## 0. Context you must respect

- **Event:** Stocklana hackathon (Solana Foundation), hosted at
  hackathons.solana.com/hackathons/stocklana
- **Submission deadline:** Friday, 25 September 2026, 4:00pm ET. Treat this as
  hard. Working software beats complete software.
- **Judging question (official):** "Could this be a real app that people will
  actually use?" Every design decision below is chosen to keep the answer to
  that question "yes" without requiring features we can't finish in time.
- **Track:** Main track (tokenized stocks on Solana), plus the Pyth bounty as
  primary secondary target. PreStocks/Tessera bounty eligibility depends on
  using their actual token as the referenced asset — flag this to the human
  operator to confirm against current bounty rules rather than assuming.

## 1. One-liner

**Recess** is parametric weekend/overnight gap insurance for tokenized stocks
on Solana. Tokenized equities trade 24/7, but the real market (NYSE) is
closed on evenings and weekends — so a holder can wake up Monday to a price
that gapped hard against them, with no way to have hedged it, because no
brokerage app offers weekend protection either. Recess lets a holder pay a
small premium before a coverage window (e.g. Friday close → Monday open) and
get paid automatically if the price gaps beyond their chosen threshold when
the market reopens. (Name plays on the market being "in recess" during the
coverage window.)

## 2. Critical design decision — read this before writing any code

**Recess does NOT require the user to deposit or lock the underlying
tokenized stock.** It is a price-based parametric contract: the user declares
a notional amount and a stock, pays a premium, and gets paid based purely on
what Pyth's oracle reports at window start vs window end. This is what makes
the product buildable in 3 days — there is no custody logic, no liquidation
logic, no dealing with different partner token standards. Do not add token
custody. If asked "shouldn't they have to hold the stock to insure it," the
answer is: real-world parametric insurance (crop insurance, flight-delay
insurance) works the same way — payout is triggered by an index (here, the
oracle price), not by proving ownership.

## 3. Tech stack

- Solana program: Anchor (Rust)
- Oracle: Pyth Network price feeds (equity feed for the chosen demo stock).
  Pyth's off-chain price service is also called "Hermes" — **do not confuse
  this with Val's own coding agent, also named Hermes.** In this repo, "Pyth
  Hermes" always refers to Pyth's price service unless stated otherwise.
- Frontend: Vite + React + TypeScript, Solana wallet adapter, Tailwind
- Settlement trigger: a small Node script (cron-style), callable manually for
  demo purposes
- Network: Solana devnet for build and demo. Mention in the README that
  mainnet deployment is the natural next step; don't burn time getting to
  mainnet unless everything else is done early.

## 4. Repo structure

```
/programs/recess/              # Anchor program
  src/lib.rs
  src/state.rs                 # Policy, Pool account structs
  src/instructions/
    deposit_liquidity.rs
    withdraw_liquidity.rs
    buy_coverage.rs
    settle_policy.rs
    set_demo_prices.rs          # demo-only, authority-gated
/app/                           # frontend — see §13 for conventions
  src/
    components/
      Navbar.tsx
      WalletConnectButton.tsx
      StockSelector.tsx
      ThresholdSelector.tsx
      PremiumEstimate.tsx
      PolicyCard.tsx
      PoolStatsPanel.tsx
      LiquidityForm.tsx
      ClaimButton.tsx
      DemoModeBadge.tsx
      DemoAdminPanel.tsx
    pages/
      BuyCoverage.tsx
      Dashboard.tsx
      LiquidityPool.tsx
    hooks/
      useProgram.ts
      usePool.ts
      usePolicies.ts
    lib/
      pyth.ts
      anchorClient.ts
      format.ts                 # shared number/price formatting helpers
    App.tsx
    main.tsx
/scripts/
  settle-cron.ts                # calls settle_policy after window end
/tests/
  recess.ts                     # Anchor test suite
README.md
```

## 5. On-chain data model

**Pool account (one per supported stock, singleton for MVP):**
- `authority: Pubkey`
- `stock_symbol: String` (e.g. "TSLA")
- `pyth_feed_id: Pubkey` or feed account reference
- `vault: Pubkey` (USDC token account holding LP capital + premiums)
- `total_lp_shares: u64`
- `demo_mode: bool`

**Policy account (PDA, seeds = [owner, pool, coverage_start_ts]):**
- `owner: Pubkey`
- `pool: Pubkey`
- `notional: u64` (USDC, 6 decimals)
- `threshold_bps: u16` (e.g. 300 = 3%)
- `premium_paid: u64`
- `reference_price: u64` (captured at buy_coverage or at window start)
- `coverage_start_ts: i64`
- `coverage_end_ts: i64`
- `status: enum { Active, Settled, Expired }`
- `payout_amount: u64` (0 until settled)

## 6. Instructions

- **`deposit_liquidity(amount)`** — LP deposits USDC into pool vault, mints
  proportional `total_lp_shares`. Basic vault share accounting, nothing fancy.
- **`withdraw_liquidity(shares)`** — burn shares, return proportional USDC.
  Add a simple check that withdrawal doesn't drop vault balance below the sum
  of outstanding policy notionals (so payouts can never be starved) — a
  single `require!` is enough for MVP.
- **`buy_coverage(notional, threshold_bps, coverage_start_ts, coverage_end_ts)`**
  — reads current Pyth price as `reference_price`, computes premium from the
  tier table (see §7), transfers premium from user to vault, creates the
  Policy account.
- **`settle_policy(policy)`** — reads Pyth price (or, if `demo_mode` is on,
  the last value set via `set_demo_prices`) as `settlement_price`. Computes
  gap%, computes payout per §7, transfers payout from vault to owner if > 0,
  marks policy `Settled`.
- **`set_demo_prices(reference_price, settlement_price)`** — authority-gated,
  only usable when `demo_mode = true` on the pool. Lets the operator simulate
  a gap on demand for judges instead of waiting for an actual weekend. Make
  this loud and obvious in code comments and in the UI (a visible "DEMO MODE"
  badge) so nobody mistakes it for the real oracle path.

## 7. Pricing and payout logic

Premium tiers (flat lookup table, not a formula — keep this simple):

| threshold_bps | premium_bps (of notional) |
|---|---|
| 200 (2%) | 400 |
| 500 (5%) | 150 |
| 1000 (10%) | 50 |

If a requested threshold isn't in the table, round to the nearest tier. Note
in the README this is a v1 simplification — a real vol-surface-based pricing
model is the natural v2.

Payout (downside gap only for v1 — protecting against the price dropping):

```
gap_pct = max(0, (reference_price - settlement_price) / reference_price)
payout = min(vault_available, notional * max(0, gap_pct - threshold_pct))
payout = min(payout, notional)   // capped at full notional
```

## 8. Pyth integration

- Use the Pyth Solana receiver / `pyth-sdk-solana` crate to read a price
  account on-chain, or Pyth's Hermes price service off-chain for the frontend
  display.
- **Task for the agent:** look up the live feed ID for the chosen demo
  stock(s) via Pyth's price feed explorer at build time — do not guess or
  hardcode a feed ID without verifying it against current Pyth docs, since
  feed IDs are exact hex values and a wrong one silently breaks the demo.
- Pick one demo stock to start (suggest TSLA or NVDA — volatile, recognizable,
  makes the "Monday gap" story land immediately for judges). Expand to more
  than one stock only after the single-stock path fully works.

## 9. Frontend requirements (functional)

- **Connect wallet** (Solana wallet adapter, devnet)
- **Buy Coverage page:** pick stock (dropdown, MVP = 1 option), input
  notional, pick threshold from the tier table, show computed premium, show
  live Pyth reference price, confirm transaction
- **Dashboard:** list user's active/settled policies, show live gap% vs their
  threshold, "Claim" button once a policy is past `coverage_end_ts`
- **Liquidity Pool page:** deposit/withdraw USDC, show pool balance,
  utilization (sum of outstanding notionals / vault balance), and a simple
  APY estimate from historical premiums collected
- A visible **DEMO MODE** indicator whenever `demo_mode` is true on the pool,
  plus an admin-only panel to call `set_demo_prices` for the live judge demo

## 10. Milestones (map directly to the 3-day window)

**Day 1**
- [ ] Anchor program: all five instructions above, compiling
- [ ] Local Anchor tests: deposit, buy coverage, settle with a forced adverse
      gap (via demo prices), settle with no gap (payout = 0), withdraw
- [ ] Pyth feed ID confirmed and read working on devnet

**Day 2**
- [ ] Frontend scaffolded per §13, wallet connect working on devnet
- [ ] Buy Coverage flow working end-to-end against the deployed program
- [ ] Dashboard + claim flow working
- [ ] Liquidity Pool page working
- [ ] `settle-cron.ts` script working (manual run is fine for demo)

**Day 3**
- [ ] Full run-through: deposit liquidity → buy coverage → trigger demo gap
      → settle → claim, recorded as a clean 1–3 minute video
- [ ] README written (see §12)
- [ ] Deployed devnet program address + live frontend URL both working
- [ ] Submit via hackathons.solana.com/hackathons/stocklana/submit before
      Friday 4:00pm ET, with GitHub link, live demo link, and video

## 11. Explicitly out of scope for v1 — do not build these

- Real volatility-surface pricing model
- Multi-stock support beyond the single demo stock
- Upside-gap coverage (only downside for v1)
- Actual custody of the underlying tokenized stock
- Mainnet deployment
- Meteora DBC premium curve — only attempt this after everything in §10 is
  done and there is still time left before the deadline

## 12. README requirements for submission

Must include: problem statement in 2–3 sentences, the user/flow, architecture
summary, why this needs Solana specifically (24/7 tokenized stock trading +
onchain oracle settlement — a brokerage app cannot offer this), explicit
statement that this is a devnet demo and what mainnet deployment would need,
an honest "what's next" section (v2 pricing model, more stocks, upside-gap
coverage, Meteora DBC premium curve), and an open-source notice per hackathon
rules.

## 13. Frontend file/component conventions

The frontend must be organized by responsibility, not built as a few large
page files. Follow these rules strictly:

- **One component per file.** Filename matches the component name in
  PascalCase (`PolicyCard.tsx` exports `PolicyCard`).
- **`/components` holds reusable, presentational pieces** — things that take
  props and render UI, with no page-level routing or top-level data-fetching
  logic. Examples: `Navbar`, `WalletConnectButton`, `StockSelector`,
  `ThresholdSelector`, `PremiumEstimate`, `PolicyCard`, `PoolStatsPanel`,
  `LiquidityForm`, `ClaimButton`, `DemoModeBadge`, `DemoAdminPanel`.
- **`/pages` holds one file per route** — `BuyCoverage`, `Dashboard`,
  `LiquidityPool`. A page composes components together and wires them to
  data; it should not contain large blocks of raw JSX that could be pulled
  out into a component.
- **`/hooks` holds shared stateful logic** pulled out of components —
  `useProgram` (Anchor provider/program instance), `usePool` (pool account
  data + subscriptions), `usePolicies` (fetch/decode the connected wallet's
  policy accounts). Components and pages call these hooks rather than
  duplicating fetch/decode logic inline.
- **`/lib` holds pure, non-React logic** — Pyth price fetching (`pyth.ts`),
  the Anchor client setup (`anchorClient.ts`), and formatting helpers
  (`format.ts` — USDC amounts, bps-to-percent, price display).
- `Navbar` is rendered once in `App.tsx` (or a shared `Layout` wrapper) and
  reused across all three pages — do not duplicate nav markup per page.
- Keep components small and single-purpose: if a component's JSX return needs
  scrolling past one screen to read, look for a piece to extract.