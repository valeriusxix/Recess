// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {RecessPool} from "../src/RecessPool.sol";

interface DeployUsdcVm {
    function envUint(string calldata name) external returns (uint256);
    function envOr(string calldata name, address defaultValue) external returns (address);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys a second pool that settles in BSC USDC. The USDT pool is unchanged.
/// This release starts in demo mode.
contract DeployUsdcScript {
    bool public IS_SCRIPT = true;

    DeployUsdcVm internal constant vm = DeployUsdcVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant USDC = 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d;
    address internal constant TSLAB = 0x5b1910eAaD6450E50f816082Aa078C41F10C292f;

    function run() external returns (RecessPool pool) {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);
        address priceReporter = vm.envOr("REPORTER_ADDRESS", deployer);
        vm.startBroadcast(key);
        pool = new RecessPool(USDC, TSLAB, deployer, priceReporter, true);
        vm.stopBroadcast();
    }
}
