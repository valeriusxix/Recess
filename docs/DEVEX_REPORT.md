# DevEx report

Notes from building Recess. Times are local to the call. No secrets are included. A successful Binance price body is not invented.

## Binance Web3

`node server/binanceProxy.mjs --probe` on 8 October 2026.

- Result: `MISSING_BINANCE_WEB3_KEYS`
- `elapsedMs`: 0
- `attempts`: empty
- `hasPrices`: false
- `hasStatusInfo`: false

The root `.env` did not have `BINANCE_WEB3_API_KEY` and `BINANCE_WEB3_SECRET_KEY`, so the proxy returned before any HTTP call. The Gap Monitor keeps every price blank in that case.

The signed call shape was checked locally, not against Binance. The prehash is the ISO-8601 UTC timestamp with milliseconds, then the upper-case method, then the path beginning with `/build`, then the body. Query values are `encodeURIComponent`'d. A unit test retries the RWA price GET once with a raw comma when the message contains "signature". That retry has not been seen on a live response, because the keys are missing. Both attempts are kept on the probe object when a live call does run.

Documented fields the parser requires: RWA `tokenPrice` and `referencePrice`, market `price`, and `statusInfo.openState`, `statusInfo.marketStatus`, and `statusInfo.reasonCode`. A missing field fails closed and does not fill a price. `statusInfo` is shown raw. Next-open and next-close key names are not guessed.

Host used in code: `https://web3.binance.com`. Endpoints: `GET /api/v1/dex/market/rwa/price`, `GET /api/v1/dex/market/rwa/underlying-market`, `POST /api/v1/dex/market/price` with one object body per token, `POST /api/v1/dex/pre-transaction/simulate`.

## Contracts

Foundry 1.8.1, solc 0.8.26, optimizer 200. `forge test` passed 21 tests: the premium and payout cases, deposit, the reserve on withdraw, buy, demo-gap settle, flat settle, and the silent USDT return. No broadcast. `script/Deploy.s.sol` reads `DEPLOYER_PRIVATE_KEY` only when someone runs it. That key was not provided and the script was not run. There is no pool address to put in `VITE_RECESS_POOL`.

## Privy and Google

`@privy-io/react-auth` is installed. The provider rejects an app id that is not 25 characters, and the page shows **Privy did not start** instead of a blank screen. A 25-character id that Privy does not recognize comes back as an invalid app id from their API and the same heading is shown.

On 8 October 2026 the local app rendered **Email me a code** on both Create your account and Sign in, with Google and wallet still on the card. That means a Privy app id is present in this environment and Privy started. No email code was entered, and Google OAuth was not completed, so the embedded wallet and the export modal were not exercised in the browser.

`npm install` of the Privy package blocked optional install scripts for `@reown/appkit`, `keccak`, `bufferutil`, and `utf-8-validate`. They were left blocked. The app does not import those packages.

The custom email and Google screens call `createWallet()` only when the Privy user has no embedded wallet. Restoring a session does not create one, because that callback arrives without an email or Google login method. A second wallet is not requested.

Google sign-in without Privy uses Google Identity Services. The button needs the Cloud Console origin to match the URL you open, including `http://localhost:5173` for the default Vite port.

## Wallet writes

The browser wallet is the injected provider already used for BNB Smart Chain. viem encodes calldata. wagmi is not wired into the pages. Each write posts to `/api/recess/simulate` first. The missing-key response is `skipped: true` with a warning, and the wallet may still send. A simulation status other than `SUCCESS` blocks the send. That missing-key branch is what the app will hit until the Binance keys exist. No mainnet transaction was sent from this build.

## Still blocked on accounts, not on code

- Privy app id, with Email and Google only, Google OAuth, and this site's origin.
- Binance Web3 key and secret in the root `.env`, without a `VITE_` prefix.
- A deployer key, gas, and the deployed address in `VITE_RECESS_POOL`.
- A little BSC USDT in the wallet that will deposit and buy.
