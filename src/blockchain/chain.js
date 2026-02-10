import Block from "./block.js";
import { cryptoHash } from "../crypto/index.js";
import Transaction from "./transaction.js";
import Wallet from "../wallet/index.js";
import { MINING_REWARD, MINING_REWARD_INPUT, HALVING_RATE } from "../config.js";
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
    for (let i = 1; i < chain.length; i++) {
      const block = chain[i];
      const transactionSet = new Set();
      let rewardTransactionCount = 0;

      for (let transaction of block.data) {
        if (transaction.input.address === MINING_REWARD_INPUT.address) {
          rewardTransactionCount += 1;
          if (rewardTransactionCount > 1) {
            console.error("Miner rewards exceed limit");
            return false;
          }

          // Dynamic Reward Validation
          // 1. Calculate Expected Base Reward based on height (i)
          const expectedBaseReward = Miner.calculateReward(i);

          // 2. Calculate Transaction Fees in this block (excluding the reward tx itself)
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

          // Allow small floating point difference? Or exact?
          // For now, exact check.
          if (actualReward !== expectedTotalReward) {
            console.error(
              `Miner reward amount is invalid. Expected: ${expectedTotalReward}, Got: ${actualReward}`,
            );
            return false;
          }
        } else {
          if (!Transaction.validTransaction(transaction)) {
            console.error("Invalid transaction");
            return false;
          }

          let trueBalance = Wallet.calculateBalance({
            chain: chain.slice(0, i),
            address: transaction.input.address,
          });

          // Check if this address has already sent a transaction in this block
          // If so, their "input amount" for THIS transaction should be their "output (change)" from the PREVIOUS transaction
          // We need to find the latest "output" to this address in the CURRENT block's preceding transactions

          for (const prevTx of block.data) {
            if (prevTx === transaction) break; // Reached current tx
            if (prevTx.outputMap[transaction.input.address]) {
              // Found a previous output to self?
              // If the address was the SENDER of prevTx, then prevTx.outputMap[address] IS their new balance (change).
              // If the address was just a RECIPIENT, their balance INCREASED.

              // However, Wallet.createTransaction logic works by:
              // 1. Calculate balance (from chain + pool).
              // 2. Set input.amount = balance.

              // If I received money in Tx A (in this block), and spend it in Tx B.
              // My input.amount in Tx B will include Tx A's output.

              // So "trueBalance" should account for ALL outputs to this address in previous transactions of this block.

              // Actually, simpler: Re-calculate balance using valid transactions in this block so far?
              // But Wallet.calculateBalance expects a CHAIN.

              // Let's accumulate changes manually.
              if (prevTx.input.address === transaction.input.address) {
                // I spent previously in this block. My balance was reset to my Change Output.
                trueBalance = prevTx.outputMap[transaction.input.address];
              } else if (prevTx.outputMap[transaction.input.address]) {
                // I received money previously in this block.
                trueBalance += prevTx.outputMap[transaction.input.address];
              }
            }
          }

          if (transaction.input.amount !== trueBalance) {
            console.error(
              `Invalid input amount for ${transaction.input.address}. Expected: ${trueBalance}, Got: ${transaction.input.amount}`,
            );
            return false;
          }

          if (transactionSet.has(transaction)) {
            console.error(
              "An identical transaction appears more than once in the block",
            );
            return false;
          }
        }
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
