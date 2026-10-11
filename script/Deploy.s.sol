// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {RecessPool} from "../src/RecessPool.sol";

interface DeployVm {
    function envUint(string calldata name) external returns (uint256);
    function envOr(string calldata name, address defaultValue) external returns (address);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Operator script. Do not broadcast without DEPLOYER_PRIVATE_KEY and BSC gas.
/// This release starts in demo mode. Live settlement is setDemoMode(false) after open demo policies are settled.
contract DeployScript {
    bool public IS_SCRIPT = true;

    DeployVm internal constant vm = DeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant USDT = 0x55d398326f99059fF775485246999027B3197955;
    address internal constant TSLAB = 0x5b1910eAaD6450E50f816082Aa078C41F10C292f;

    function run() external returns (RecessPool pool) {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);
        address priceReporter = vm.envOr("REPORTER_ADDRESS", deployer);
        vm.startBroadcast(key);
        pool = new RecessPool(USDT, TSLAB, deployer, priceReporter, true);
        vm.stopBroadcast();
    }
}
