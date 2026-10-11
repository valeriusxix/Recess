// Runtime bytecode hash of RecessPool from the Foundry build in this repo.
// The hash is keccak256 of deployedBytecode.object. Live code has the
// immutable USDT and TSLAB addresses filled in, so those spans are zeroed
// before the comparison. Regenerate both values after a contract change.
export const POOL_RUNTIME_HASH = "0x1c14509fcaeb40749aa2d18306c6c43ac982075f50e52d97c18d0e3e61f53697";

export const POOL_IMMUTABLE_SPANS = [
  [774, 32],
  [854, 32],
  [1729, 32],
  [1868, 32],
  [5432, 32],
  [5476, 32],
  [7194, 32],
  [7532, 32],
];
