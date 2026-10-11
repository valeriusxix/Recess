// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface RecessVm {
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function warp(uint256 timestamp) external;
    function expectRevert(bytes4 selector) external;
}

abstract contract RecessTest {
    RecessVm internal constant vm = RecessVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function setUp() public virtual {}

    function assertEq(uint256 left, uint256 right) internal pure {
        require(left == right, "uint mismatch");
    }

    function assertEq(address left, address right) internal pure {
        require(left == right, "address mismatch");
    }

    function assertEq(bytes32 left, bytes32 right) internal pure {
        require(left == right, "bytes32 mismatch");
    }

    function assertTrue(bool value) internal pure {
        require(value, "expected true");
    }

    function assertFalse(bool value) internal pure {
        require(!value, "expected false");
    }
}
