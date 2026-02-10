export const DIFFICULTY = 1;
export const MIN_DIFFICULTY = 1; // Ensure at least 4 hex zeros
export const MINE_RATE = 3000; // Target block time in ms
export const INITIAL_BALANCE = 0;
export const MINING_REWARD = 1000;
export const HALVING_RATE = 10000; // Halve reward every 10,000 blocks
export const MAX_BLOCK_SIZE = 5; // Max transactions per block
export const MIN_TRANSACTION_FEE = 1;

export const MINING_REWARD_INPUT = { address: "*authorized-reward*" };

// P2P Protocol Versioning
export const P2P_VERSION = 1;
export const MIN_PEER_VERSION = 1;

// Precision Handling for Amounts
// Use integer-based amounts (satoshi model) to avoid floating point errors
export const DECIMAL_PLACES = 8; // Support up to 0.00000001 precision
export const UNIT_MULTIPLIER = 10 ** DECIMAL_PLACES; // 100,000,000

// Utility functions for amount conversion
export function toBaseUnits(amount) {
  // Convert decimal amount to integer base units
  return Math.round(amount * UNIT_MULTIPLIER);
}

export function fromBaseUnits(baseUnits) {
  // Convert integer base units to decimal amount
  return baseUnits / UNIT_MULTIPLIER;
}

export function roundAmount(amount, decimals = DECIMAL_PLACES) {
  // Round amount to specified decimal places
  const multiplier = 10 ** decimals;
  return Math.round(amount * multiplier) / multiplier;
}

// Epsilon for floating point comparison (temporary, will migrate to integers)
export const AMOUNT_EPSILON = 0.00000001;

export function amountsEqual(a, b) {
  // Compare amounts with epsilon tolerance
  return Math.abs(a - b) < AMOUNT_EPSILON;
}

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
