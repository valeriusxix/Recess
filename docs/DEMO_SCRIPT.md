# Demo script

Keep this under four minutes. Stay on BNB Smart Chain. Do not buy or sell TSLAB on camera. The stock never needs to move.

This recording is the demo release. Live reporter settlement is the same pool a few days later, after open demo covers are settled and the authority calls `setDemoMode(false)`.

The navbar shows **DEMO MODE** only after the deployed pool reads `demoMode = true`. Leave that badge up for the whole recording. The deploy script turns demo mode on. If the badge is missing, the pool address is unset or the read failed, and the rest of this script cannot send. A sentence at the top of each product page still says this release is demo only. That sentence is not the badge.

## Before you record

- `VITE_RECESS_POOL` is the deployed pool, and Vite was restarted after it was set.
- The authority wallet is the deployer. It holds a little BNB for gas and at least 70 BSC USDT.
- Sign in with an account that already exists, so the recording starts on the product rather than on account creation.

## Clicks

1. Open **Monitor**. Say that cover follows TSLAB and that Ondo and xStocks are comparison only. If the Binance keys are set, read the prints that are on screen. If a card shows an em dash, say the feed did not return that field. Do not fill a number in yourself.
2. Open **Pool**. In **Deposit amount (USDT)** enter `50`. Click **Deposit**. Confirm the wallet. Wait until the page names the transaction.
3. Open **Cover**. The one-hour window is selected for this demo release. Set notional to `20` and the gap to **5%**. Switch to **Weekend** if you want the Friday window. Either window settles from the demo prints. The quote should read **0.30 USDT**. Click **Review cover**. Approve USDT if the wallet asks, then confirm the purchase. The button reads **Waiting for wallet…** until the wallet finishes.
4. Open **Dashboard**. In **Set demo prices**, leave the open print at `200` and the close print at `170`. Click **Set demo prices** from the authority wallet. Confirm it.
5. On the new policy, click **Claim**. The payout for 20 USDT at a 5% gap, from 200 to 170, is 2 USDT. The claim pays the wallet that bought the cover.
6. Optional, if you still have time: buy a second 20 USDT cover at 5%, set the demo prints to `200` and `200`, and claim it. Say that a flat print pays nothing. The policy still closes.
7. Back on **Pool**, enter a share amount in **Shares to withdraw** that is smaller than the shares the page says this wallet holds, and smaller than what would break the outstanding cover. Click **Withdraw shares**.

If a transaction is rejected by simulation, stop and read the message. Nothing was sent. A missing Binance key is a warning, not a stop: the wallet can still confirm.
