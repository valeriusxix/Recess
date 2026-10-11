// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice BEP-20 helper. An empty return is success because Binance-Peg BSC-USD
/// transfer and transferFrom do not return a bool.
library SafeBep20 {
    error TransferFailed();

    function safeTransfer(address token, address to, uint256 amount) internal {
        _call(token, abi.encodeWithSelector(0xa9059cbb, to, amount));
    }

    function safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        _call(token, abi.encodeWithSelector(0x23b872dd, from, to, amount));
    }

    function _call(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok) revert TransferFailed();
        if (ret.length == 0) return;
        if (ret.length < 32 || !abi.decode(ret, (bool))) revert TransferFailed();
    }
}
