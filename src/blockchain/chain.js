import Block from "./block.js";
import { cryptoHash } from "../crypto/index.js";
import Transaction from "./transaction.js";
import Wallet from "../wallet/index.js";
import {
  MINING_REWARD,
  MINING_REWARD_INPUT,
  HALVING_RATE,
  NONCE_ENFORCEMENT_INDEX,
} from "../config.js";
import Storage from "../storage/index.js";
import Miner from "../mining/miner.js";

class Blockchain {
  constructor() {
    this.chain = [Block.genesis()];
    this.storage = new Storage();
  }

  async init() {
    const savedChain = await this.storage.loadChain();
    if (savedChain && savedChain.length > 0) {
      // Validate Genesis Block match
      const loadedGenesis = savedChain[0];
      const codeGenesis = Block.genesis();

      const isGenesisValid =
        loadedGenesis.hash === codeGenesis.hash &&
        JSON.stringify(loadedGenesis.data) === JSON.stringify(codeGenesis.data);

      if (!isGenesisValid) {
        console.error(
          "⚠️  Saved chain has invalid genesis block. Resetting chain.",
        );
        await this.storage.clear();
        this.chain = [Block.genesis()];
        await this.storage.saveChain(this.chain);
        return;
      }

      // CRITICAL: Validate entire chain integrity
      if (!Blockchain.isValidChain(savedChain)) {
        console.error(
          "❌ Saved chain failed validation. Possible corruption detected. Resetting to genesis.",
        );
        await this.storage.clear();
        this.chain = [Block.genesis()];
        await this.storage.saveChain(this.chain);
        return;
      }

      // Chain is valid, load it
      this.chain = savedChain;
      console.log(
        `✅ Loaded ${savedChain.length} blocks from storage (validated)`,
      );
    } else {
      console.log("🆕 Starting with genesis block");
    }
  }

  addBlock({ data }) {
    const newBlock = Block.mineBlock({
      lastBlock: this.chain[this.chain.length - 1],
      data,
    });
    this.chain.push(newBlock);
    this.storage.saveChain(this.chain);
    return newBlock;
  }

  submitBlock(block) {
    // CRITICAL: Validate block index to prevent duplicate blocks
    // This prevents race condition where:
    // 1. Node starts mining block N
    // 2. Receives block N from peer via P2P
    // 3. Finishes mining and tries to submit duplicate block N
    const expectedIndex = this.chain[this.chain.length - 1].index + 1;

    if (block.index !== expectedIndex) {
      console.log(
        `⚠️  Rejecting block with index ${block.index}. Expected: ${expectedIndex}. Chain already advanced.`,
      );
      return null;
    }

    // Validate that block builds on current chain tip
    const lastBlock = this.chain[this.chain.length - 1];
    if (block.lastHash !== lastBlock.hash) {
      console.log(
        `⚠️  Rejecting block ${block.index}. lastHash mismatch. Expected: ${lastBlock.hash}, Got: ${block.lastHash}`,
      );
      return null;
    }

    // CRITICAL: Validate transaction data in the block
    if (!this.validateBlockData({ block, chain: this.chain })) {
      console.log(
        `⚠️  Rejecting block ${block.index}. Invalid transaction data.`,
      );
      return null;
    }

    this.chain.push(block);
    this.storage.saveChain(this.chain);
    return block;
  }

  replaceChain(chain, validateTransactions, onSuccess) {
    if (chain.length <= this.chain.length) {
      // console.log("Received chain is not longer than current chain");
      return;
    }

    if (!Blockchain.isValidChain(chain)) {
      console.error("The incoming chain must be valid");
      return;
    }

    if (validateTransactions && !this.validTransactionData({ chain })) {
      console.error("The incoming chain has invalid transaction data");
      return;
    }

    console.log("Replacing chain with", chain.length, "blocks");
    this.chain = chain;

    // Save entire chain to storage
    this.storage.saveChain(chain);

    // Call onSuccess AFTER chain is replaced
    if (onSuccess) onSuccess();
  }

  validTransactionData({ chain }) {
    const balanceMap = {}; // Track balances per address
    const nonceMap = {}; // Track nonces per address

    for (let i = 1; i < chain.length; i++) {
      const block = chain[i];
      if (
        !this.validateBlockData({
          block,
          chain: chain.slice(0, i), // Still pass chain for difficulty checks in block validation if needed, but tx validation uses state
          balanceMap,
          nonceMap,
        })
      ) {
        return false;
      }
    }
    return true;
  }

  validateBlockData({ block, chain, balanceMap, nonceMap }) {
    const transactionSet = new Set();
    let rewardTransactionCount = 0;

    // If state maps are not provided (e.g. single block validation), build them locally
    // This maintains backward compatibility for existing calls like submitBlock
    const localNonceMap = nonceMap || {};
    const localBalanceMap = balanceMap || {};
    const useGlobalState = !!balanceMap;

    // Only rebuild state if not provided (O(N) operation)
    if (!useGlobalState) {
      // Calculate expected nonces and balances from chain history
      // This is expensive O(N) but only done for single block validation
      for (let i = 1; i < chain.length; i++) {
        for (let tx of chain[i].data) {
          if (tx.input.address !== MINING_REWARD_INPUT.address) {
            const addr = tx.input.address;
            localNonceMap[addr] = Math.max(
              localNonceMap[addr] || 0,
              (tx.input.nonce || 0) + 1,
            );

            // Update balance for sender
            localBalanceMap[addr] =
              (localBalanceMap[addr] || 0) - tx.input.amount;

            // Update balance for recipients
            for (const [recipient, amount] of Object.entries(tx.outputMap)) {
              localBalanceMap[recipient] =
                (localBalanceMap[recipient] || 0) + amount;
            }
          } else {
            // Reward tx only updates recipient balances
            for (const [recipient, amount] of Object.entries(tx.outputMap)) {
              localBalanceMap[recipient] =
                (localBalanceMap[recipient] || 0) + amount;
            }
          }
        }
      }
    }

    for (let transaction of block.data) {
      if (transaction.input.address === MINING_REWARD_INPUT.address) {
        rewardTransactionCount += 1;
        if (rewardTransactionCount > 1) {
          console.error("Miner rewards exceed limit");
          return false;
        }

        // Dynamic Reward Validation
        const expectedBaseReward = Miner.calculateReward(block.index);

        // Calculate Transaction Fees in this block (excluding the reward tx itself)
        let totalFees = 0;
        for (let tx of block.data) {
          if (tx.input.address !== MINING_REWARD_INPUT.address) {
            const inputAmount = tx.input.amount;
            const outputAmount = Object.values(tx.outputMap).reduce(
              (acc, val) => acc + val,
              0,
            );
            totalFees += inputAmount - outputAmount;
          }
        }

        const actualReward = Object.values(transaction.outputMap)[0];
        const expectedTotalReward = expectedBaseReward + totalFees;

        if (actualReward !== expectedTotalReward) {
          console.error(
            `Miner reward amount is invalid at block ${block.index}. Expected: ${expectedTotalReward}, Got: ${actualReward}`,
          );
          return false;
        }

        // Update state for reward recipients
        for (const [recipient, amount] of Object.entries(
          transaction.outputMap,
        )) {
          localBalanceMap[recipient] =
            (localBalanceMap[recipient] || 0) + amount;
        }
      } else {
        // Validate nonce
        const addr = transaction.input.address;
        const expectedNonce = localNonceMap[addr] || 0;
        const txNonce = transaction.input.nonce || 0;

        // Enforce nonce check only if block index is above the soft fork limit
        if (block.index >= NONCE_ENFORCEMENT_INDEX) {
          if (txNonce !== expectedNonce) {
            console.error(
              `Invalid nonce for ${addr} at block ${block.index}. Expected: ${expectedNonce}, Got: ${txNonce}`,
            );
            return false;
          }
        }

        localNonceMap[addr] = txNonce + 1; // Update for next transaction

        if (!Transaction.validTransaction(transaction)) {
          console.error("Invalid transaction");
          return false;
        }

        // Validate Balance using State Map instead of recalculating
        // Balance map tracks CONFIRMED balance before this block + changes within this block (so far?)
        // Wait, localBalanceMap was updated for previous blocks.
        // For current block, we need to track intra-block changes too?
        // NO, transaction input amount must be <= balance BEFORE this transaction (or block).
        // Actually, if a user receives funds in Tx 1, can they spend in Tx 2 (same block)?
        // Yes, usually.

        // So we use localBalanceMap as running balance.
        let trueBalance = localBalanceMap[addr] || 0; // Default to 0 (INITIAL_BALANCE is 0)

        if (transaction.input.amount > trueBalance) {
          console.error(
            `Invalid input amount for ${transaction.input.address} at block ${block.index}. Expected: ${trueBalance}, Got: ${transaction.input.amount}`,
          );
          // Wait! transaction.input.amount is the TOTAL funds in the wallet at the time of tx creation?
          // OR is it the amount being SPENT?
          // In this model, input.amount IS the current balance of the wallet (UTXO-like or Account-based snapshot?).
          // Let's check Wallet.createTransaction.
          // input: { timestamp, amount: senderWallet.balance, address, signature }
          // Ah! input.amount IS THE SENDER'S BALANCE.
          // So we must verify that input.amount === trueBalance.
          return false;
        }

        // If valid, update running balance state
        // In this model, the outputMap defines new balances? No.
        // Input.amount is just for signature verification data?
        // Balance update logic:
        // Sender balance reduces by (amount + fee).
        // But here we just see outputs.
        // Input = Balance.
        // Output = Recipient Amount + Sender Remainder.
        // So Sender Balance becomes Sender Remainder.

        // Update balance for sender (to remainder)
        const senderRemainder = transaction.outputMap[addr];
        if (senderRemainder !== undefined) {
          localBalanceMap[addr] = senderRemainder;
        } else {
          // If sender not in output, balance is 0?
          // Or consumed entirely? (Should usually have change if balance > amount)
          localBalanceMap[addr] = 0;
        }

        // Update balance for other recipients (add to their balance)
        for (const [recipient, amount] of Object.entries(
          transaction.outputMap,
        )) {
          if (recipient !== addr) {
            localBalanceMap[recipient] =
              (localBalanceMap[recipient] || 0) + amount;
          }
        }

        if (transactionSet.has(transaction)) {
          console.error(
            "An identical transaction appears more than once in the block",
          );
          return false;
        }
        transactionSet.add(transaction);
      }
    }
    return true;
  }

  static isValidChain(chain) {
    const genesis = chain[0];
    const realGenesis = Block.genesis();

    const genesisProps = ["index", "timestamp", "lastHash", "hash", "data"];

    for (const key of genesisProps) {
      if (JSON.stringify(genesis[key]) !== JSON.stringify(realGenesis[key])) {
        console.log(
          `❌ Invalid Genesis ${key}:`,
          genesis[key],
          "Expected:",
          realGenesis[key],
        );
        return false;
      }
    }

    for (let i = 1; i < chain.length; i++) {
      const { index, timestamp, lastHash, hash, nonce, difficulty, data } =
        chain[i];
      const actualLastHash = chain[i - 1].hash;
      const lastDifficulty = chain[i - 1].difficulty;
      const lastIndex = chain[i - 1].index;

      if (lastHash !== actualLastHash) {
        console.log(
          `❌ Invalid Last Hash at index ${i}:`,
          lastHash,
          "Expected:",
          actualLastHash,
        );
        return false;
      }

      if (index !== lastIndex + 1) {
        console.log(
          `❌ Invalid Index at index ${i}:`,
          index,
          "Expected:",
          lastIndex + 1,
        );
        return false;
      }

      const validatedHash = cryptoHash(
        index,
        timestamp,
        lastHash,
        data,
        nonce,
        difficulty,
      );
      if (hash !== validatedHash) {
        console.log(
          `❌ Invalid Hash at index ${i}:`,
          hash,
          "Calculated:",
          validatedHash,
        );
        return false;
      }

      if (Math.abs(lastDifficulty - difficulty) > 1) {
        console.log(
          `❌ Invalid Difficulty jump at index ${i}:`,
          difficulty,
          "Last:",
          lastDifficulty,
        );
        return false;
      }
    }

    return true;
  }
}

export default Blockchain;
