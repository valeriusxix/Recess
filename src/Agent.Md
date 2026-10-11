# AGENT.md — Recess

Build instructions for an LLM coding agent. This file is the source of truth for the BNB Chain rebuild. The Stocklana / Solana spec is retired. Do not add Anchor, Pyth, Solana PDAs, @solana/web3.js, or a Solana wallet adapter to the shipping path.

Where something is ambiguous, prefer the simplest version that still produces a working, demoable end-to-end product by the deadline below.

## 0. Context

- Event: BNB Hack: Tokenized Stocks Edition.
- Submission deadline: Sunday, 11 October 2026, 12:00 UTC. Treat this as hard. Working software beats complete software.
- Network: BNB Smart Chain mainnet only. Chain id 56. Devnet and opBNB are out of scope.
- Judging: technical 30%, creativity 25%, the DevEx report 25%, product/UX 20%. Both a project (repo, video at most 4 minutes, deployed link) and docs/DEVEX_REPORT.md are mandatory.
- Product constraint: spot only. Dry-run every write with the Binance Transaction simulate endpoint, then send small live amounts. Teams fund their own wallets. There is no live PnL score.
- Track fit: parametric weekend/overnight gap cover on a tokenized stock, settled in USDT, with prices sourced from the Binance Web3 API.

## 1. One-liner

Recess is parametric weekend/overnight gap cover for tokenized stocks on BNB Smart Chain. Tokenized equities trade 24/7, but the real market (NYSE) is closed on evenings and weekends, so a holder can wake up Monday to a price that gapped hard against them. Recess lets a holder pay a small USDT premium before a coverage window (for example Friday close to Monday open) and get paid automatically if the printed price gaps down beyond their chosen threshold when the window ends. The name plays on the market being in recess during the coverage window.

## 2. Critical design decision

Recess does not take custody of TSLAB, TSLAon, or TSLAx. It is a price-based parametric contract: the user declares a notional and pays a premium, and the payout is based on the window-open print versus the window-close print. Real-world parametric cover (crop cover, flight-delay cover) works the same way. The payout follows an index. Do not add token custody, liquidation, or partner-token transfer logic.

v1 covers one venue: bStocks TSLAB. Ondo (TSLAon) and xStocks (TSLAx) appear on the Gap Monitor only.

## 3. Tech stack

- Contract: Foundry (Solidity 0.8.26), optimizer 200.
- Unit of account: USDT on BSC (18 decimals). The pool holds USDT itself. SafeBep20 treats an empty return as success, because Binance-Peg BSC-USD transfer / transferFrom do not return a bool.
- Prices: Binance Web3 API (RWA price, underlying-market status, Market price). An authorized reporter posts window start and window end on-chain. The contract does not call HTTP.
- Demo prices: setDemoPrices, authority-gated, only while demoMode is true. Loud in Solidity comments, events, and the UI.
- Frontend: Vite + React + TypeScript + Tailwind + wagmi/viem. Injected wallet. Chain is BSC (id 56).
- Secrets: BINANCE_WEB3_API_KEY and BINANCE_WEB3_SECRET_KEY live in the repo-root .env and are read only by server/binanceProxy.mjs. Never prefix them with VITE_.
- Settlement trigger: scripts/settle-keeper.ts, callable by hand for the demo.
- Agents: a local wallet skill plus a thin BNB Agent Studio keeper note. Thin is enough. Missing is not.

## 4. Repo structure
/src/Pricing.sol
/src/SafeBep20.sol
/src/RecessPool.sol
/script/Deploy.s.sol
/test/Pricing.t.sol
/test/RecessPool.t.sol
/test/mocks/MockUsdt.sol
/foundry.toml
/server/binanceProxy.mjs          # signed proxy, also mounted by Vite
/shared/pricing.mjs               # same table as Pricing.sol
/shared/tokens.mjs                # verified BSC addresses
/app/                             # frontend — see §13
  src/components/                 # one component per file
  src/pages/                      # BuyCoverage, Dashboard, LiquidityPool, GapMonitor
  src/hooks/                      # useRecess, usePool, usePolicies, useRwaPrices
  src/lib/                        # binanceWeb3, recessClient, recessAbi, format, tokens, wagmi, windows
/scripts/settle-keeper.ts
/agent/SKILL.md
/agent/AGENTIC_WALLET.md
/agent/AGENT_STUDIO.md
/agent/scripts/recess-skill.mjs
/docs/DEVEX_REPORT.md
/docs/DEMO_SCRIPT.md
README.md

## 5. On-chain data model

Pool (one contract, one covered token, TSLAB):

- authority, reporter
- usdt (immutable), coveredToken (immutable, informational, never transferred)
- demoMode
- totalLpShares, outstandingNotional, premiumsCollected
- demoReferencePrice, demoSettlementPrice (8-decimal USD)
- postedReferencePrice, postedSettlementPrice, postedWindowStart, postedWindowEnd
- windowStartPosted, windowEndPosted
- policyCount
- stockSymbol() returns "TSLAB"

Policy (id is a counter starting at 1, stored in a mapping; owner ids are in an array):

- owner, notional (USDT, 18 decimals), thresholdBps (the snapped tier)
- premiumPaid
- referencePrice (0 until settlement fills it)
- coverageStartTs, coverageEndTs
- status: Active, Settled, Expired
- payoutAmount (0 until settled)
- settledWithDemoPrices

viewPool() returns one PoolView struct in the field order above so the app can read the pool in one call.

## 6. Instructions

- `depositLiquidity(amount)` — pull USDT, mint shares. First deposit is 1 share per atomic unit. Later deposits: amount * totalShares / vaultBalance. If totalShares > 0 and the vault is empty, deposits revert (DepositsDisabledInsolvent via the pricing library).
- `withdrawLiquidity(shares)` — burn shares, return proportional USDT. Revert ReserveWouldBreak if the vault would fall below outstandingNotional.
- `buyCoverage(notional, thresholdBps, coverageStartTs, coverageEndTs)` — snap the threshold to the tier table, pull the premium, create the policy with referencePrice = 0. Revert Undercollateralized unless the vault after the premium still covers outstandingNotional + notional. Window rules: end > start, end > now, duration from 60 seconds to 7 days, start not more than 1 hour in the past.
- `postWindowStart(referencePrice, windowStartTs)` — reporter only. Reverts while demoMode is true (DemoModeBlocksReporter). Price must be greater than 0.
- `postWindowEnd(settlementPrice, windowEndTs)` — same gate as the start post.
- `settlePolicy(policyId)` — if demoMode, use the demo prices and skip the clock. Otherwise require block.timestamp >= coverageEndTs and both reporter posts. Compute the payout, decrease outstanding by the full notional, transfer the payout to the owner, mark Settled. Anyone may send it. The payout goes to the owner. Claim in the UI is this call.
- `setDemoPrices(referencePrice, settlementPrice)` — authority only, demoMode only. Emits DemoPricesSet with the banner string "DEMO MODE".
- `setDemoMode` / `setReporter` — authority only.

buyCoverage does not take a price. The reporter (or demo mode) supplies the prints.

## 7. Pricing and payout

Premium tiers (flat lookup, not a formula):

| threshold_bps | premium_bps of notional |
| --- | --- |
| 200 (2%) | 400 |
| 500 (5%) | 150 |
| 1000 (10%) | 50 |

If the requested threshold is not in the table, snap to the nearest tier. Ties keep the earlier, tighter tier (higher premium). 350 snaps to 200. 750 snaps to 500. A premium that rounds to 0 reverts PremiumTooSmall.

Payout, downside only:
gap_pct = max(0, (reference_price - settlement_price) / reference_price)
payout = min(vault_available, notional * max(0, gap_pct - threshold_pct))
payout = min(payout, notional)

Price scale is 8-decimal USD (200e8 = $200). A zero reference price pays 0. A settlement at or above the reference pays 0. A gap inside the threshold, including a gap exactly equal to the threshold, pays 0.

shared/pricing.mjs and app/src/lib/format.ts must stay aligned with src/Pricing.sol.

## 8. Binance Web3

Host: https://web3.binance.com. Sign on the server.

- Headers: X-OC-APIKEY, X-OC-TIMESTAMP (ISO-8601 UTC with milliseconds), X-OC-SIGN (base64 HMAC-SHA256).
- Prehash: timestamp + UPPER(method) + requestPath + body.
- requestPath includes the /build prefix and the query string.

Endpoints the proxy actually calls:

- GET /api/v1/dex/market/rwa/price with binanceChainId and tokenContractAddresses.
- GET /api/v1/dex/market/rwa/underlying-market with binanceChainId and tokenContractAddress (TSLAB).
- POST /api/v1/dex/market/price with one object body { binanceChainId, tokenContractAddress }. One call per token. Do not invent a batch array.
- POST /api/v1/dex/pre-transaction/simulate with { binanceChainId, evmTx: { from, to, value, data } }.

Envelope is HTTP 200 with { code, msg, data, timestamp }. code === 0 is success. The client fails closed when a documented field is missing. It does not invent a price.

statusInfo fields the UI reads: openState, marketStatus (premarket | regular | postmarket | overnight | closed | pause), reasonCode. Next-open and next-close key names were not in the indexed docs. The UI shows the raw statusInfo object and does not guess those keys.

Query values are encodeURIComponent'd so the signature matches the wire. If a live call returns a signature error, retry once with a raw comma in tokenContractAddresses and log both attempts in the DevEx report.

Verify USDT and TSLAB (and the monitor tokens) with cast call before hardcoding. Current checksums are in §18. Do not guess a new address.

## 9. Frontend

- Connect an injected wallet on BSC. If the wallet is on another chain, offer a switch to chain id 56.
- Buy Coverage: TSLAB only, notional, threshold from the tier table, computed premium, live RWA token price and reference price, hour window or next weekend window, confirm. Dry-run first.
- Dashboard: the connected wallet's policies, live gap versus the threshold, Claim once the policy is active and (demo mode is on, or now >= coverageEndTs).
- Liquidity: deposit and withdraw USDT, vault, shares, utilization (outstanding / vault), and a yield label that is premiums collected / vault × 52, described as one weekend repeated. It is not a volatility model.
- Gap Monitor: TSLAB vs TSLAon vs TSLAx vs the RWA reference, plus the Market API price, plus US session open/closed.
- DEMO MODE badge on every page while demoMode is true, plus an admin panel to call setDemoPrices. The panel is visible in demo mode. Only the authority can send.
- Amounts above 100 USDT require an extra confirmation in the UI. The contract does not hard-cap at 100.
- If VITE_RECESS_POOL is unset, say so on the page. Quotes still load.
- BSC USDT allowance: if the current allowance is non-zero and too small, approve(0) then approve(amount).

## 10. Milestones

Contracts

- [x] Pricing library and the four payout cases (adverse gap pays, no gap = 0, inside threshold = 0, capped at notional and at vault)
- [x] deposit, withdraw reserve, buy, demo-gap settle, no-gap settle
- [ ] Deployed pool address on BSC (needs DEPLOYER_PRIVATE_KEY and gas)

App

- [x] Vite + wagmi scaffold, four routes, demo badge and admin panel
- [ ] Wallet dry-run of deposit → buy → setDemoPrices → settle on a deployed pool

Ops

- [x] settle-keeper.ts dry-run by default, --send to broadcast
- [x] Wallet skill quote / buy calldata / claim calldata, plus Agent Studio note
- [ ] First signed Binance Web3 call once keys exist (the missing-key result is still logged)

## 11. Out of scope
- A second covered stock
- Upside-gap cover
- A volatility-surface pricing model
- Custody of TSLAB, TSLAon, or TSLAx
- Solana, Anchor, Pyth, Meteora, perps
- opBNB or BSC testnet as the shipping target

## 12. Agents

- agent/SKILL.md and agent/scripts/recess-skill.mjs: quote, buy, claim, self-check. buy and claim print unsigned calldata. They do not sign and they do not swap.
- The skill refuses argv that contains swap, trade, buy-tslab, sell, or custody.
- agent/AGENTIC_WALLET.md: how to preview that calldata with baw contract-call preview using the documented flags only.
- agent/AGENT_STUDIO.md: a keeper prompt (post window, or in demo mode call setDemoPrices, then settlePolicy). Do not install global CLIs from the agent. Identity, ERC-8004, and x402 notes stay documentary until the operator runs bag themselves.
- Expected self-check: 1000 USDT at 500 bps premiums 15 USDT. Reference 200 and settlement 170 at 500 bps pays 100 USDT. Flat pays 0. A 4% gap inside a 5% threshold pays 0. A total-loss 200 bps policy against a 10 USDT vault pays 10 USDT.

## 13. Frontend file conventions

- One component per file. Filename matches the component (PolicyCard.tsx exports PolicyCard).
- `/components` are presentational. They take props. They do not fetch and they do not own routing. Navbar, WalletConnectButton, StockSelector, ThresholdSelector, PremiumEstimate, PolicyCard, PoolStatsPanel, LiquidityForm, ClaimButton, DemoModeBadge, DemoAdminPanel, plus AmountWarning, MarketStatusBadge, VenueCard.
- `/pages` are one file per route: BuyCoverage, Dashboard, LiquidityPool, GapMonitor. A page composes components and wires hooks.
- `/hooks` own shared state: useRecess (reads and writes), usePool, usePolicies, useRwaPrices.
- `/lib` is non-React: binanceWeb3.ts, recessClient.ts, recessAbi.ts, format.ts, tokens.ts, wagmi.ts, windows.ts.
- Navbar is rendered once in App.tsx and includes the DEMO MODE badge.
- If a component's JSX needs scrolling past one screen, extract a piece.

## 14. README requirements

README.md must include: the problem in a few sentences, the user flow, the architecture, why 24/7 tokenized stocks on BSC plus on-chain USDT settlement is something a brokerage app cannot offer, an explicit statement that this is a BSC mainnet demo and what production still needs, an honest what's-next section (vol-surface pricing, more stocks, upside gap, still no custody), an open-source notice, how to run, the env names, a DEMO MODE warning, and the verified addresses.

## 15. DevEx report

Start docs/DEVEX_REPORT.md immediately. Log every docs, auth, and API friction as it happens: URL, status, body shape or the exact error, and how long it took. A missing key is logged as the proxy's MISSING_BINANCE_WEB3_KEYS error. Do not invent a successful response. Do not paste secrets.

## 16. Demo script

docs/DEMO_SCRIPT.md is the judge path: Gap Monitor, deposit about 50 USDT, buy about 20 USDT at 5% (premium 0.30 USDT), setDemoPrices 200 → 170, claim, optional flat settle, withdraw. Name the clicks. Keep DEMO MODE visible. Do not trade the stock on camera.

## 17. Secrets and dry-run

- Secrets stay in the root .env. Commit .env.example only.
- The app calls /api/recess/quotes and /api/recess/simulate. Vite mounts the proxy. A standalone node server/binanceProxy.mjs listens on RECESS_API_PORT (default 8787). node server/binanceProxy.mjs --probe is the first-call logger.
- Every wallet write goes through simulate first. A missing key skips simulation with a visible warning so the demo is not blocked. A business failure blocks the send.
- The keeper is stricter: it refuses --send without a successful simulation unless --allow-unsimulated is also passed.
- Do not deploy unless DEPLOYER_PRIVATE_KEY and gas are already available. Do not invent a pool address.

## 18. Addresses

BSC chain id 56. Checked with cast call symbol() and decimals() on https://bsc-dataseed.binance.org.

| Asset | Address | Role |
| --- | --- | --- |
| USDT | 0x55d398326f99059fF775485246999027B3197955 | Unit of account, 18 decimals |
| TSLAB | 0x5b1910eAaD6450E50f816082Aa078C41F10C292f | Covered bStock, 18 decimals |
| TSLAon | 0x2494b603319d4D9F9715c9f4496d9E0364B59d93 | Gap Monitor only |
| TSLAx | 0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0 | Gap Monitor only |

Weekend preset: Friday 16:00 ET to Monday 09:30 ET. In EDT that is 20:00 UTC to 13:30 UTC. In EST that is 21:00 UTC to 14:30 UTC. The demo hour window is start = now − 60 seconds, end = start + 3600 seconds, so a slow transaction stays inside the 1-hour start skew.