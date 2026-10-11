# Recess

Recess is a parametric weekend and overnight gap cover for the tokenized Tesla stock TSLAB on BNB Smart Chain. You pay a USDT premium before the New York market closes. If the printed price gaps down past the threshold you chose, the pool pays you in USDT. Recess does not take custody of TSLAB, TSLAon, or TSLAx.

A brokerage app stops with the exchange. Tokenized TSLAB keeps trading on BNB Smart Chain through the weekend, and the payout is an on-chain USDT transfer from a pool that follows printed prices. That combination — a 24/7 tokenized stock, a published gap threshold, and settlement in USDT the buyer already holds — is outside what a brokerage account can book when the cash session is closed.

## User flow

1. Create an account or sign in with email, Google, or an EVM wallet.
2. On the homepage, price a cover. This release continues into the one-hour window so it can be settled today. The Friday 16:00 ET to Monday 09:30 ET window is still on the cover page.
3. On Cover, review the premium, connect a wallet on BNB Smart Chain (chain id 56), approve USDT, and buy. The stock stays in the buyer's wallet.
4. On Dashboard, read the policies for that wallet. In this demo release, claim after the authority sets both prints. After the pool leaves demo mode, a claim waits until the window closes.
5. On Pool, deposit USDT or withdraw shares. A withdrawal cannot leave the vault below cover that is still outstanding.
6. On Monitor, compare TSLAB with Ondo TSLAon and xStocks TSLAx. Only TSLAB is covered.
7. Open Portfolio from the wallet dropdown to see open positions, deposits, withdrawals, premiums, payouts, and recent in-app activity alerts.

Portfolio follows the explicitly connected BNB Smart Chain wallet used for transactions; the Privy email wallet is not silently treated as the transaction wallet. Activity alerts poll while the app is open.

Amounts above 100 USDT ask for an extra confirmation in the page. The contract does not hard-cap at 100.

## Architecture

The app is a Vite + React client. Quotes use the flat tier table in `shared/pricing.mjs`, which matches `src/Pricing.sol`.

| Piece | Role |
| --- | --- |
| `src/RecessPool.sol` | USDT pool. Buys coverage, holds collateral, settles one TSLAB policy at a time. The covered token address is recorded and never transferred. |
| `src/Pricing.sol` | Snaps a threshold to 2%, 5%, or 10% and computes the downside payout. |
| `src/SafeBep20.sol` | Treats an empty BEP-20 return as success, which is what Binance-Peg BSC-USD does. |
| `server/binanceProxy.mjs` | Signs Binance Web3 requests on the server. The browser calls `/api/recess/quotes` and `/api/recess/simulate`. |
| Injected wallet | Sends the transaction after simulation. There is no wagmi client. |

The contract does not call HTTP. A reporter posts the open and close prints, except while demo mode is on. In demo mode the authority sets both prints and anyone can settle without waiting for the clock.

This release stays in demo mode on BNB Smart Chain. The pool is not deployed from this workspace. Live settlement is the same contract a few days later: settle every open demo policy, then the authority calls `setDemoMode(false)`. `lockLiveMode()` is one-way and is for when demo mode should stay off for good. Production still needs the deployed pool, Binance Web3 keys on the server, and a reporter posting each policy's own window. There is no keeper in this tree.

## Pricing

| Gap threshold | Premium |
| --- | --- |
| 2% (200 bps) | 4% of notional |
| 5% (500 bps) | 1.5% of notional |
| 10% (1000 bps) | 0.5% of notional |

Other thresholds snap to the nearest tier. A tie keeps the tighter tier. 350 snaps to 2%. 750 snaps to 5%. A premium that rounds to zero is rejected.

The payout is downside only. A flat or higher print pays nothing. A gap inside the threshold, including a gap exactly equal to it, pays nothing. The payout is also capped by the notional and by the USDT sitting in the vault. Prices inside the contract are 8-decimal USD.

## DEMO MODE

The deploy script starts the pool with demo mode on. While a live read of the pool says `demoMode` is true, the navbar shows **DEMO MODE** and Dashboard and Pool show a form that calls `setDemoPrices`. Only the authority can send that transaction. Those prints settle this release. When you ship live, settle every open demo policy, then call `setDemoMode(false)` from the authority wallet. That read removes the demo note and returns the homepage to the weekend window. Leave `lockLiveMode()` until demo mode should stay off for good.

If `VITE_RECESS_POOL` is unset, the badge stays off and buy, deposit, withdraw, and claim say that nothing was sent.

## What's next

A volatility-surface premium, cover on more than TSLAB, and an upside gap are all future work. Custody of the tokenized stock stays out of scope.

## Run it

```bash
npm install
npm run dev
```

Open the printed localhost URL. Contract tests, with [Foundry](https://book.getfoundry.sh/) installed:

```bash
forge test
```

The Binance proxy is mounted by Vite. A standalone process is:

```bash
node server/binanceProxy.mjs
node server/binanceProxy.mjs --probe
```

`--probe` prints whether quotes loaded. It does not print secrets. With the keys absent it prints `MISSING_BINANCE_WEB3_KEYS` and no price.

Deploy only when you have a key and BNB for gas. This command is not run by the tests:

```bash
forge script script/Deploy.s.sol:DeployScript --rpc-url https://bsc-dataseed.binance.org --broadcast
```

Then put the new address in `VITE_RECESS_POOL` and restart Vite.

USDT and USDC are separate pools. The USDT pool above is unchanged. To add USDC, deploy a second pool and put its address in `VITE_RECESS_POOL_USDC`:

```bash
forge script script/DeployUsdc.s.sol:DeployUsdcScript --rpc-url https://bsc-dataseed.binance.org --broadcast
```

A deposit in one token does not back a cover bought in the other. The app shows USDC before that address is set, and it does not send USDC until the address is there.

## Environment

Names only. Values live in `.env`, which is not committed. The blank template is `.env.example`.

| Name | Where it is read |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Google button when Privy is not configured |
| `VITE_PRIVY_APP_ID` | Email and Google sign-in through Privy, including one embedded wallet for those two methods |
| `VITE_RECESS_POOL` | Deployed USDT pool address. Leave blank until you deploy. |
| `VITE_RECESS_POOL_USDC` | Deployed USDC pool address. Leave blank until that second pool is deployed. The USDC choice does not send until this is set. |
| `VITE_RECESS_POOL_START_BLOCK` | Pool deployment block used to scan the wallet's complete activity history. Defaults to this deployment's block. |
| `BINANCE_WEB3_API_KEY` | Server only. Do not prefix with `VITE_`. |
| `BINANCE_WEB3_SECRET_KEY` | Server only. Do not prefix with `VITE_`. |
| `RECESS_API_PORT` | Standalone proxy port. Default 8787. |
| `DEPLOYER_PRIVATE_KEY` | Only for the Foundry deploy script. Do not commit it. |

Every wallet write is simulated first. If the Binance keys are missing, the page shows a warning and still lets the wallet send, so a demo is not blocked. If simulation returns a business failure, the page does not send.

## Verified addresses

BNB Smart Chain, chain id 56. Checked with `symbol()` and `decimals()` on `https://bsc-dataseed.binance.org`.

| Asset | Address | Role |
| --- | --- | --- |
| USDT | `0x55d398326f99059fF775485246999027B3197955` | Premiums and payouts, 18 decimals |
| TSLAB | `0x5b1910eAaD6450E50f816082Aa078C41F10C292f` | The covered bStock |
| TSLAon | `0x2494b603319d4D9F9715c9f4496d9E0364B59d93` | Gap Monitor only |
| TSLAx | `0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0` | Gap Monitor only |

## Open source

Source in this repository is the app, the contracts, and the proxy. No license file is included yet. Do not commit `.env`.

The judge path is written out in `docs/DEMO_SCRIPT.md`. Friction from the build is in `docs/DEVEX_REPORT.md`.
