export const DIFFICULTY = 5;
export const MIN_DIFFICULTY = 3; // Ensure at least 4 hex zeros
export const MINE_RATE = 3000; // Target block time in ms

export const HALVING_RATE = 10000; // Halve reward every 10,000 blocks
export const MAX_BLOCK_SIZE = 5; // Max transactions per block
export const MIN_TRANSACTION_FEE = 1;

export const MINING_REWARD_INPUT = {
  address: "*authorized-reward*",
  amount: 0,
};

// P2P Protocol Versioning
export const P2P_VERSION = 1;
export const MIN_PEER_VERSION = 1;

// Precision Handling for Amounts
// Precision Handling for Amounts
// Use BigInt for all internal calculations (Satoshis/Wei model)
export const DECIMAL_PLACES = 8;
export const UNIT_MULTIPLIER = 100000000n; // 10^8

export const INITIAL_BALANCE = 0n;
export const MINING_REWARD = 1000n * UNIT_MULTIPLIER; // 1000 SHRIMP

// Utility functions for amount conversion
export function toBaseUnits(amount) {
  if (amount === undefined || amount === null) return 0n;
  // Convert decimal string/number to BigInt base units
  // usage: toBaseUnits("10.5") -> 1050000000n
  // We use string parsing to avoid float errors
  const [integer, fraction = ""] = String(amount).split(".");
  const paddedFraction = fraction
    .padEnd(DECIMAL_PLACES, "0")
    .slice(0, DECIMAL_PLACES);
  return BigInt(integer + paddedFraction);
}

export function fromBaseUnits(baseUnits) {
  // Convert BigInt base units to formatted decimal string
  // usage: fromBaseUnits(1050000000n) -> "10.50000000"
  const s = baseUnits.toString().padStart(DECIMAL_PLACES + 1, "0");
  const integer = s.slice(0, -DECIMAL_PLACES);
  const fraction = s.slice(-DECIMAL_PLACES);
  // Optional: remove trailing zeros? No, let's keep fixed precision for now
  return `${integer}.${fraction}`;
}

// Validation helper (Strict equality for BigInt)
// No more epsilon needed!
export const amountsEqual = (a, b) => a === b;

// Fallback Bootstrap Peers
// These peers are used when no other peers are configured
// Update this list with well-known community nodes
export const FALLBACK_BOOTSTRAP_PEERS = [
  "ws://192.168.100.174:5001", // Seed node
];

export const GENESIS_DATA = {
  index: 0,
  timestamp: 1,
  lastHash: "-----",
  hash: "hash-one",
  difficulty: DIFFICULTY,
  nonce: 0,
  data: [],
};

// Soft Fork: Enforce strict nonce checking only after this block index
// This allows legacy chains (without nonce enforcement) to remain valid
export const NONCE_ENFORCEMENT_INDEX = 3600;

// Soft Fork: Enforce strict balance/input amount checking only after this index
// Preserves legacy chain with potential double-spend artifacts from older wallet versions
export const SOFT_FORK_INDEX = 5000;

export const TRANSACTION_TYPE = {
  TRANSFER: "TRANSFER",
  CREATE_CONTRACT: "CREATE_CONTRACT",
  CALL_CONTRACT: "CALL_CONTRACT",
};
