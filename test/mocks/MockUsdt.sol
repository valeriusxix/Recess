// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice USDT stand-in. silent=true returns no bool, matching Binance-Peg BSC-USD.
contract MockUsdt {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public silent;
    bool public failNext;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function burn(address from, uint256 amount) external {
        balanceOf[from] -= amount;
    }

    function setSilent(bool next) external {
        silent = next;
    }

    function setFailNext(bool next) external {
        failNext = next;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external {
        _move(msg.sender, to, amount);
        _finish();
    }

    function transferFrom(address from, address to, uint256 amount) external {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _move(from, to, amount);
        _finish();
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }

    function _finish() internal {
        if (silent) {
            assembly {
                return(0, 0)
            }
        }
        if (failNext) {
            failNext = false;
            assembly {
                mstore(0, 0)
                return(0, 32)
            }
        }
        assembly {
            mstore(0, 1)
            return(0, 32)
        }
    }
}
