// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Pricing} from "../src/Pricing.sol";
import {RecessPool} from "../src/RecessPool.sol";
import {SafeBep20} from "../src/SafeBep20.sol";
import {MockUsdt} from "./mocks/MockUsdt.sol";
import {RecessTest} from "./RecessTest.sol";

contract RecessPoolTest is RecessTest {
    MockUsdt internal usdt;
    RecessPool internal pool;
    address internal authority = address(0xA11CE);
    address internal reporter = address(0xB0B);
    address internal lp = address(0x1111);
    address internal buyer = address(0x2222);
    address internal stranger = address(0x3333);
    address internal tslab = address(0x5b1910eAaD6450E50f816082Aa078C41F10C292f);

    function setUp() public override {
        usdt = new MockUsdt();
        pool = new RecessPool(address(usdt), tslab, authority, reporter, true);
    }

    function test_viewPoolFieldOrderAndSymbol() public view {
        RecessPool.PoolView memory view_ = pool.viewPool();
        assertEq(view_.authority, authority);
        assertEq(view_.reporter, reporter);
        assertEq(view_.usdt, address(usdt));
        assertEq(view_.coveredToken, tslab);
        assertTrue(view_.demoMode);
        assertEq(view_.policyCount, 0);
        assertEq(keccak256(bytes(view_.stockSymbol)), keccak256(bytes("TSLAB")));
        assertEq(keccak256(bytes(pool.stockSymbol())), keccak256(bytes("TSLAB")));
    }

    function test_firstDepositIsOneSharePerUnitAndLaterDepositsAreProportional() public {
        _mintAndApprove(lp, 250 ether);
        vm.prank(lp);
        pool.depositLiquidity(100 ether);
        assertEq(pool.sharesOf(lp), 100 ether);
        assertEq(pool.totalLpShares(), 100 ether);

        vm.prank(lp);
        pool.depositLiquidity(150 ether);
        assertEq(pool.sharesOf(lp), 250 ether);
        assertEq(pool.accountedAssets(), 250 ether);
        assertEq(pool.vaultBalance(), 250 ether);
    }

    function test_directTransferDoesNotStealTheNextDeposit() public {
        address attacker = address(0xA77);
        _mintAndApprove(attacker, 1);
        vm.prank(attacker);
        pool.depositLiquidity(1);
        usdt.mint(address(pool), 1000 ether);

        _mintAndApprove(lp, 1000 ether);
        vm.prank(lp);
        pool.depositLiquidity(1000 ether);
        assertEq(pool.sharesOf(attacker), 1);
        assertEq(pool.sharesOf(lp), 1000 ether);

        vm.prank(attacker);
        pool.withdrawLiquidity(1);
        assertEq(usdt.balanceOf(attacker), 1);

        vm.prank(lp);
        pool.withdrawLiquidity(1000 ether);
        assertEq(usdt.balanceOf(lp), 1000 ether);
        assertEq(pool.vaultBalance(), 1000 ether);
        assertEq(pool.accountedAssets(), 0);
    }

    function test_depositRevertsWhenTheVaultIsEmptyButSharesRemain() public {
        _mintAndApprove(lp, 100 ether);
        vm.prank(lp);
        pool.depositLiquidity(100 ether);
        usdt.burn(address(pool), 100 ether);

        assertEq(pool.vaultBalance(), 0);
        assertEq(pool.totalLpShares(), 100 ether);
        _mintAndApprove(lp, 1 ether);
        vm.expectRevert(Pricing.DepositsDisabledInsolvent.selector);
        vm.prank(lp);
        pool.depositLiquidity(1 ether);
    }

    function test_withdrawCannotBreakTheReserve() public {
        _mintAndApprove(lp, 100 ether);
        vm.prank(lp);
        pool.depositLiquidity(100 ether);
        _mintAndApprove(buyer, 2 ether);
        uint256 start = block.timestamp;
        vm.prank(buyer);
        pool.buyCoverage(80 ether, 500, start, start + 1 hours);

        uint256 allShares = pool.sharesOf(lp);
        vm.expectRevert(RecessPool.ReserveWouldBreak.selector);
        vm.prank(lp);
        pool.withdrawLiquidity(allShares);

        uint256 surplus = pool.vaultBalance() - pool.outstandingNotional();
        uint256 sharesOut = (surplus * pool.totalLpShares()) / pool.vaultBalance();
        vm.prank(lp);
        pool.withdrawLiquidity(sharesOut);
        assertTrue(pool.vaultBalance() >= pool.outstandingNotional());
    }

    function test_buyPullsPremiumAndRevertsWhenUndercollateralized() public {
        _mintAndApprove(lp, 10 ether);
        vm.prank(lp);
        pool.depositLiquidity(10 ether);
        _mintAndApprove(buyer, 100 ether);
        uint256 start = block.timestamp;

        vm.expectRevert(RecessPool.Undercollateralized.selector);
        vm.prank(buyer);
        pool.buyCoverage(100 ether, 500, start, start + 1 hours);

        vm.prank(buyer);
        uint256 policyId = pool.buyCoverage(10 ether, 350, start, start + 1 hours);
        RecessPool.Policy memory policy = pool.getPolicy(policyId);
        assertEq(policy.owner, buyer);
        assertEq(policy.thresholdBps, 200);
        assertEq(policy.premiumPaid, 0.4 ether);
        assertEq(policy.referencePrice, 0);
        assertEq(uint256(policy.status), uint256(RecessPool.Status.Active));
        assertEq(pool.outstandingNotional(), 10 ether);
        assertEq(pool.premiumsCollected(), 0.4 ether);
        assertEq(pool.policyIdsOf(buyer)[0], policyId);
    }

    function test_windowRules() public {
        _fundBuyerAndLp();
        uint256 start = block.timestamp;
        vm.expectRevert(RecessPool.BadWindow.selector);
        vm.prank(buyer);
        pool.buyCoverage(10 ether, 500, start, start + 30);

        vm.warp(start + 2 hours);
        vm.expectRevert(RecessPool.BadWindow.selector);
        vm.prank(buyer);
        pool.buyCoverage(10 ether, 500, start, start + 3 hours);

        vm.warp(start);
        vm.expectRevert(RecessPool.BadWindow.selector);
        vm.prank(buyer);
        pool.buyCoverage(10 ether, 500, start, start + 8 days);
    }

    function test_demoGapSettlePaysTheOwnerAndSkipsTheClock() public {
        _fundBuyerAndLp();
        uint256 start = block.timestamp + 1 hours;
        vm.prank(buyer);
        pool.buyCoverage(20 ether, 500, start, start + 1 hours);
        vm.prank(authority);
        pool.setDemoPrices(200e8, 170e8);

        uint256 before = usdt.balanceOf(buyer);
        vm.prank(stranger);
        pool.settlePolicy(1);
        RecessPool.Policy memory policy = pool.getPolicy(1);
        assertEq(policy.payoutAmount, 2 ether);
        assertEq(policy.referencePrice, 200e8);
        assertTrue(policy.settledWithDemoPrices);
        assertEq(uint256(policy.status), uint256(RecessPool.Status.Settled));
        assertEq(usdt.balanceOf(buyer) - before, 2 ether);
        assertEq(pool.outstandingNotional(), 0);
    }

    function test_demoFlatSettlePaysZeroAndStillClosesThePolicy() public {
        _fundBuyerAndLp();
        uint256 start = block.timestamp;
        vm.prank(buyer);
        pool.buyCoverage(20 ether, 500, start, start + 1 hours);
        vm.prank(authority);
        pool.setDemoPrices(200e8, 200e8);
        uint256 before = usdt.balanceOf(buyer);
        pool.settlePolicy(1);
        assertEq(usdt.balanceOf(buyer), before);
        assertEq(pool.getPolicy(1).payoutAmount, 0);
        assertEq(pool.outstandingNotional(), 0);
        assertEq(uint256(pool.getPolicy(1).status), uint256(RecessPool.Status.Settled));
    }

    function test_liveSettleUsesReporterPrintsAndTheClock() public {
        vm.expectRevert(RecessPool.DemoModeBlocksReporter.selector);
        vm.prank(reporter);
        pool.postWindowStart(200e8, block.timestamp);

        vm.prank(authority);
        pool.setDemoMode(false);
        _fundBuyerAndLp();
        uint256 start = block.timestamp;
        vm.prank(buyer);
        pool.buyCoverage(1000 ether, 500, start, start + 1 hours);

        vm.prank(reporter);
        pool.postWindowStart(200e8, start);
        vm.prank(reporter);
        pool.postWindowEnd(170e8, start + 1 hours);

        vm.expectRevert(RecessPool.WindowOpen.selector);
        pool.settlePolicy(1);

        vm.warp(start + 1 hours);
        pool.settlePolicy(1);
        assertEq(pool.getPolicy(1).payoutAmount, 100 ether);
        assertFalse(pool.getPolicy(1).settledWithDemoPrices);
    }

    function test_missingLivePrintsRevert() public {
        vm.prank(authority);
        pool.setDemoMode(false);
        _fundBuyerAndLp();
        uint256 start = block.timestamp;
        vm.prank(buyer);
        pool.buyCoverage(20 ether, 500, start, start + 1 hours);
        vm.warp(start + 1 hours);
        vm.expectRevert(RecessPool.PrintsMissing.selector);
        pool.settlePolicy(1);
    }

    function test_demoPricesAreAuthorityOnly() public {
        vm.expectRevert(RecessPool.NotAuthority.selector);
        vm.prank(buyer);
        pool.setDemoPrices(200e8, 170e8);

        vm.prank(authority);
        pool.setDemoMode(false);
        vm.expectRevert(RecessPool.NotDemoMode.selector);
        vm.prank(authority);
        pool.setDemoPrices(200e8, 170e8);

        vm.expectRevert(RecessPool.NotReporter.selector);
        pool.postWindowStart(200e8, block.timestamp);
    }

    function test_liveSettleRejectsAPrintForADifferentWindow() public {
        vm.prank(authority);
        pool.setDemoMode(false);
        _fundBuyerAndLp();
        uint256 start = block.timestamp;
        vm.prank(buyer);
        pool.buyCoverage(20 ether, 500, start, start + 1 hours);
        vm.prank(reporter);
        pool.postWindowStart(200e8, start + 10);
        vm.prank(reporter);
        pool.postWindowEnd(170e8, start + 1 hours);
        vm.warp(start + 1 hours);
        vm.expectRevert(RecessPool.WindowMismatch.selector);
        pool.settlePolicy(1);
    }

    function test_demoModeCannotCoverAnOutstandingLivePolicy() public {
        vm.prank(authority);
        pool.setDemoMode(false);
        _fundBuyerAndLp();
        uint256 start = block.timestamp;
        vm.prank(buyer);
        pool.buyCoverage(10 ether, 500, start, start + 1 hours);
        vm.expectRevert(RecessPool.DemoModeHasOutstanding.selector);
        vm.prank(authority);
        pool.setDemoMode(true);
    }

    function test_lockLiveModeCannotBeReopened() public {
        vm.prank(authority);
        pool.lockLiveMode();
        assertFalse(pool.demoMode());
        assertTrue(pool.liveLocked());
        vm.expectRevert(RecessPool.LiveModeLocked.selector);
        vm.prank(authority);
        pool.setDemoMode(true);
    }

    function test_pauseBlocksNewMoneyAndLeavesTheClaimOpen() public {
        _fundBuyerAndLp();
        uint256 start = block.timestamp;
        vm.prank(buyer);
        pool.buyCoverage(20 ether, 500, start, start + 1 hours);
        vm.prank(authority);
        pool.pause();

        _mintAndApprove(lp, 1 ether);
        vm.expectRevert(RecessPool.Paused.selector);
        vm.prank(lp);
        pool.depositLiquidity(1 ether);

        vm.prank(authority);
        pool.setDemoPrices(200e8, 170e8);
        pool.settlePolicy(1);
        assertEq(pool.getPolicy(1).payoutAmount, 2 ether);

        uint256 sharesBefore = pool.sharesOf(lp);
        vm.prank(lp);
        pool.withdrawLiquidity(1 ether);
        assertEq(pool.sharesOf(lp), sharesBefore - 1 ether);
    }

    function test_authorityMovesOnlyAfterTheNewKeyAccepts() public {
        address next = address(0xBEEF);
        vm.prank(authority);
        pool.proposeAuthority(next);
        vm.expectRevert(RecessPool.NotProposedAuthority.selector);
        vm.prank(stranger);
        pool.acceptAuthority();
        vm.prank(next);
        pool.acceptAuthority();
        assertEq(pool.authority(), next);
        vm.expectRevert(RecessPool.NotAuthority.selector);
        vm.prank(authority);
        pool.pause();
    }

    function test_silentUsdtTransferSucceedsAndFalseReturnReverts() public {
        usdt.setSilent(true);
        _mintAndApprove(lp, 50 ether);
        vm.prank(lp);
        pool.depositLiquidity(50 ether);
        assertEq(pool.vaultBalance(), 50 ether);

        usdt.setSilent(false);
        usdt.setFailNext(true);
        _mintAndApprove(stranger, 10 ether);
        vm.expectRevert(SafeBep20.TransferFailed.selector);
        vm.prank(stranger);
        pool.depositLiquidity(10 ether);
    }

    function test_premiumTooSmallReverts() public {
        _mintAndApprove(buyer, 1);
        vm.expectRevert(Pricing.PremiumTooSmall.selector);
        vm.prank(buyer);
        pool.buyCoverage(1, 500, block.timestamp, block.timestamp + 1 hours);
    }

    function _fundBuyerAndLp() internal {
        _mintAndApprove(lp, 20_000 ether);
        vm.prank(lp);
        pool.depositLiquidity(9_950 ether);
        _mintAndApprove(buyer, 1_000 ether);
    }

    function _mintAndApprove(address account, uint256 amount) internal {
        usdt.mint(account, amount);
        vm.prank(account);
        usdt.approve(address(pool), type(uint256).max);
    }
}
