// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Pricing} from "./Pricing.sol";
import {SafeBep20} from "./SafeBep20.sol";

interface IErc20Balance {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice One USDT pool covering TSLAB price gaps. The covered token is informational and is never transferred.
contract RecessPool {
    enum Status {
        Active,
        Settled,
        Expired
    }

    struct Policy {
        address owner;
        uint256 notional;
        uint256 thresholdBps;
        uint256 premiumPaid;
        uint256 referencePrice;
        uint256 coverageStartTs;
        uint256 coverageEndTs;
        Status status;
        uint256 payoutAmount;
        bool settledWithDemoPrices;
    }

    /// @dev Field order is the app's single pool read. stockSymbol is last.
    struct PoolView {
        address authority;
        address reporter;
        address usdt;
        address coveredToken;
        bool demoMode;
        uint256 totalLpShares;
        uint256 outstandingNotional;
        uint256 premiumsCollected;
        uint256 demoReferencePrice;
        uint256 demoSettlementPrice;
        uint256 postedReferencePrice;
        uint256 postedSettlementPrice;
        uint256 postedWindowStart;
        uint256 postedWindowEnd;
        bool windowStartPosted;
        bool windowEndPosted;
        uint256 policyCount;
        string stockSymbol;
    }

    error ZeroAddress();
    error ZeroAmount();
    error ZeroShares();
    error ZeroPrice();
    error BadWindow();
    error Undercollateralized();
    error ReserveWouldBreak();
    error InsufficientShares();
    error NotAuthority();
    error NotReporter();
    error NotDemoMode();
    error DemoModeBlocksReporter();
    error UnknownPolicy();
    error NotActive();
    error WindowOpen();
    error PrintsMissing();
    error DemoPricesMissing();
    error WindowMismatch();
    error DemoModeHasOutstanding();
    error LiveModeLocked();
    error Paused();
    error Reentrancy();
    error NotProposedAuthority();
    error ShortTransfer();

    event Deposited(address indexed lp, uint256 amount, uint256 shares);
    event Withdrawn(address indexed lp, uint256 shares, uint256 amount);
    event CoverageBought(
        uint256 indexed policyId,
        address indexed owner,
        uint256 notional,
        uint256 thresholdBps,
        uint256 premium
    );
    event PolicySettled(uint256 indexed policyId, address indexed owner, uint256 payout, bool demo);
    event DemoPricesSet(uint256 referencePrice, uint256 settlementPrice, string banner);
    event DemoModeSet(bool demoMode);
    event ReporterSet(address reporter);
    event WindowStartPosted(uint256 referencePrice, uint256 windowStartTs);
    event WindowEndPosted(uint256 settlementPrice, uint256 windowEndTs);
    event PausedSet(bool paused);
    event AuthorityProposed(address indexed nextAuthority);
    event AuthorityAccepted(address indexed authority);
    event LiveModeLockedSet();

    address public immutable usdt;
    address public immutable coveredToken;

    address public authority;
    address public reporter;
    bool public demoMode;
    uint256 public totalLpShares;
    uint256 public outstandingNotional;
    uint256 public premiumsCollected;
    uint256 public demoReferencePrice;
    uint256 public demoSettlementPrice;
    uint256 public postedReferencePrice;
    uint256 public postedSettlementPrice;
    uint256 public postedWindowStart;
    uint256 public postedWindowEnd;
    bool public windowStartPosted;
    bool public windowEndPosted;
    uint256 public policyCount;
    uint256 public accountedAssets;
    address public proposedAuthority;
    bool public paused;
    bool public liveLocked;
    bool internal _entered;

    mapping(uint256 => Policy) internal _policies;
    mapping(address => uint256[]) internal _policyIds;
    mapping(address => uint256) public sharesOf;

    uint256 internal constant MIN_WINDOW = 60;
    uint256 internal constant MAX_WINDOW = 7 days;
    uint256 internal constant MAX_START_SKEW = 1 hours;

    modifier nonReentrant() {
        if (_entered) revert Reentrancy();
        _entered = true;
        _;
        _entered = false;
    }

    modifier notPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor(address usdt_, address coveredToken_, address authority_, address reporter_, bool demoMode_) {
        if (usdt_ == address(0) || coveredToken_ == address(0) || authority_ == address(0) || reporter_ == address(0)) {
            revert ZeroAddress();
        }
        usdt = usdt_;
        coveredToken = coveredToken_;
        authority = authority_;
        reporter = reporter_;
        demoMode = demoMode_;
    }

    function stockSymbol() external pure returns (string memory) {
        return "TSLAB";
    }

    function vaultBalance() public view returns (uint256) {
        return IErc20Balance(usdt).balanceOf(address(this));
    }

    function viewPool() external view returns (PoolView memory pool) {
        pool.authority = authority;
        pool.reporter = reporter;
        pool.usdt = usdt;
        pool.coveredToken = coveredToken;
        pool.demoMode = demoMode;
        pool.totalLpShares = totalLpShares;
        pool.outstandingNotional = outstandingNotional;
        pool.premiumsCollected = premiumsCollected;
        pool.demoReferencePrice = demoReferencePrice;
        pool.demoSettlementPrice = demoSettlementPrice;
        pool.postedReferencePrice = postedReferencePrice;
        pool.postedSettlementPrice = postedSettlementPrice;
        pool.postedWindowStart = postedWindowStart;
        pool.postedWindowEnd = postedWindowEnd;
        pool.windowStartPosted = windowStartPosted;
        pool.windowEndPosted = windowEndPosted;
        pool.policyCount = policyCount;
        pool.stockSymbol = "TSLAB";
    }

    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        return _policies[policyId];
    }

    function policyIdsOf(address owner) external view returns (uint256[] memory) {
        return _policyIds[owner];
    }

    function depositLiquidity(uint256 amount) external nonReentrant notPaused {
        if (amount == 0) revert ZeroAmount();
        uint256 liquid = vaultBalance();
        if (totalLpShares > 0 && (accountedAssets == 0 || liquid == 0 || liquid < accountedAssets)) {
            revert Pricing.DepositsDisabledInsolvent();
        }

        uint256 assetsBefore = accountedAssets;
        uint256 received = _pull(msg.sender, amount);
        accountedAssets = assetsBefore + received;

        uint256 shares = totalLpShares == 0 ? received : (received * totalLpShares) / assetsBefore;
        if (shares == 0) revert ZeroShares();
        totalLpShares += shares;
        sharesOf[msg.sender] += shares;
        emit Deposited(msg.sender, received, shares);
    }

    function withdrawLiquidity(uint256 shares) external nonReentrant {
        if (shares == 0) revert ZeroAmount();
        if (shares > sharesOf[msg.sender] || totalLpShares == 0) revert InsufficientShares();

        uint256 book = accountedAssets;
        uint256 liquid = vaultBalance();
        uint256 amount = (shares * book) / totalLpShares;
        if (amount == 0) revert ZeroAmount();
        if (amount > book || amount > liquid || book - amount < outstandingNotional) revert ReserveWouldBreak();

        sharesOf[msg.sender] -= shares;
        totalLpShares -= shares;
        accountedAssets = book - amount;
        SafeBep20.safeTransfer(usdt, msg.sender, amount);
        emit Withdrawn(msg.sender, shares, amount);
    }

    function buyCoverage(uint256 notional, uint256 thresholdBps, uint256 coverageStartTs, uint256 coverageEndTs)
        external
        nonReentrant
        notPaused
        returns (uint256 policyId)
    {
        if (notional == 0) revert ZeroAmount();
        if (coverageEndTs <= coverageStartTs || coverageEndTs <= block.timestamp) revert BadWindow();
        uint256 duration = coverageEndTs - coverageStartTs;
        if (duration < MIN_WINDOW || duration > MAX_WINDOW) revert BadWindow();
        if (block.timestamp > coverageStartTs && block.timestamp - coverageStartTs > MAX_START_SKEW) revert BadWindow();

        (uint256 snapped, uint256 premiumAmount) = Pricing.premium(notional, thresholdBps);
        uint256 received = _pull(msg.sender, premiumAmount);
        if (received != premiumAmount) revert ShortTransfer();

        accountedAssets += premiumAmount;
        outstandingNotional += notional;
        premiumsCollected += premiumAmount;
        if (accountedAssets < outstandingNotional || vaultBalance() < outstandingNotional) revert Undercollateralized();

        policyId = ++policyCount;
        _policies[policyId] = Policy({
            owner: msg.sender,
            notional: notional,
            thresholdBps: snapped,
            premiumPaid: premiumAmount,
            referencePrice: 0,
            coverageStartTs: coverageStartTs,
            coverageEndTs: coverageEndTs,
            status: Status.Active,
            payoutAmount: 0,
            settledWithDemoPrices: false
        });
        _policyIds[msg.sender].push(policyId);
        emit CoverageBought(policyId, msg.sender, notional, snapped, premiumAmount);
    }

    function postWindowStart(uint256 referencePrice, uint256 windowStartTs) external nonReentrant {
        if (msg.sender != reporter) revert NotReporter();
        if (demoMode) revert DemoModeBlocksReporter();
        if (referencePrice == 0) revert ZeroPrice();
        postedReferencePrice = referencePrice;
        postedWindowStart = windowStartTs;
        windowStartPosted = true;
        emit WindowStartPosted(referencePrice, windowStartTs);
    }

    function postWindowEnd(uint256 settlementPrice, uint256 windowEndTs) external nonReentrant {
        if (msg.sender != reporter) revert NotReporter();
        if (demoMode) revert DemoModeBlocksReporter();
        if (settlementPrice == 0) revert ZeroPrice();
        postedSettlementPrice = settlementPrice;
        postedWindowEnd = windowEndTs;
        windowEndPosted = true;
        emit WindowEndPosted(settlementPrice, windowEndTs);
    }

    /// @notice Anyone may call. In demo mode the clock is skipped and the demo prints are used.
    /// Live mode pays only from the print posted for this policy's own window.
    function settlePolicy(uint256 policyId) external nonReentrant {
        Policy storage policy = _policies[policyId];
        if (policy.owner == address(0)) revert UnknownPolicy();
        if (policy.status != Status.Active) revert NotActive();

        uint256 referencePrice;
        uint256 settlementPrice;
        bool usedDemo;
        if (demoMode) {
            if (demoReferencePrice == 0 || demoSettlementPrice == 0) revert DemoPricesMissing();
            referencePrice = demoReferencePrice;
            settlementPrice = demoSettlementPrice;
            usedDemo = true;
        } else {
            if (block.timestamp < policy.coverageEndTs) revert WindowOpen();
            if (!windowStartPosted || !windowEndPosted) revert PrintsMissing();
            if (postedReferencePrice == 0 || postedSettlementPrice == 0) revert PrintsMissing();
            if (postedWindowStart != policy.coverageStartTs || postedWindowEnd != policy.coverageEndTs) {
                revert WindowMismatch();
            }
            referencePrice = postedReferencePrice;
            settlementPrice = postedSettlementPrice;
        }

        uint256 liquid = vaultBalance();
        uint256 book = accountedAssets < liquid ? accountedAssets : liquid;
        uint256 payoutAmount = Pricing.payout(
            policy.notional,
            policy.thresholdBps,
            referencePrice,
            settlementPrice,
            book
        );

        policy.referencePrice = referencePrice;
        policy.payoutAmount = payoutAmount;
        policy.status = Status.Settled;
        policy.settledWithDemoPrices = usedDemo;
        outstandingNotional -= policy.notional;
        if (payoutAmount > 0) {
            accountedAssets -= payoutAmount;
            SafeBep20.safeTransfer(usdt, policy.owner, payoutAmount);
        }
        emit PolicySettled(policyId, policy.owner, payoutAmount, usedDemo);
    }

    function setDemoPrices(uint256 referencePrice, uint256 settlementPrice) external nonReentrant {
        if (msg.sender != authority) revert NotAuthority();
        if (!demoMode) revert NotDemoMode();
        if (referencePrice == 0 || settlementPrice == 0) revert ZeroPrice();
        demoReferencePrice = referencePrice;
        demoSettlementPrice = settlementPrice;
        emit DemoPricesSet(referencePrice, settlementPrice, "DEMO MODE");
    }

    function setDemoMode(bool enabled) external nonReentrant {
        if (msg.sender != authority) revert NotAuthority();
        if (enabled && liveLocked) revert LiveModeLocked();
        if (enabled && !demoMode && outstandingNotional > 0) revert DemoModeHasOutstanding();
        demoMode = enabled;
        emit DemoModeSet(enabled);
    }

    /// @notice One-way switch. Call only after demo policies are settled and before outside deposits.
    function lockLiveMode() external nonReentrant {
        if (msg.sender != authority) revert NotAuthority();
        if (outstandingNotional > 0) revert DemoModeHasOutstanding();
        demoMode = false;
        liveLocked = true;
        emit DemoModeSet(false);
        emit LiveModeLockedSet();
    }

    function pause() external nonReentrant {
        if (msg.sender != authority) revert NotAuthority();
        paused = true;
        emit PausedSet(true);
    }

    function unpause() external nonReentrant {
        if (msg.sender != authority) revert NotAuthority();
        paused = false;
        emit PausedSet(false);
    }

    function proposeAuthority(address nextAuthority) external nonReentrant {
        if (msg.sender != authority) revert NotAuthority();
        if (nextAuthority == address(0)) revert ZeroAddress();
        proposedAuthority = nextAuthority;
        emit AuthorityProposed(nextAuthority);
    }

    function acceptAuthority() external nonReentrant {
        if (msg.sender != proposedAuthority) revert NotProposedAuthority();
        authority = msg.sender;
        proposedAuthority = address(0);
        emit AuthorityAccepted(msg.sender);
    }

    function setReporter(address nextReporter) external nonReentrant {
        if (msg.sender != authority) revert NotAuthority();
        if (nextReporter == address(0)) revert ZeroAddress();
        reporter = nextReporter;
        emit ReporterSet(nextReporter);
    }

    /// @dev Counts only tokens this call actually received, and only up to `amount`.
    /// A direct transfer is not added to the share price.
    function _pull(address from, uint256 amount) internal returns (uint256 received) {
        uint256 beforeBalance = vaultBalance();
        SafeBep20.safeTransferFrom(usdt, from, address(this), amount);
        uint256 afterBalance = vaultBalance();
        if (afterBalance < beforeBalance) revert ShortTransfer();
        received = afterBalance - beforeBalance;
        if (received < amount) revert ShortTransfer();
        if (received > amount) received = amount;
    }
}
