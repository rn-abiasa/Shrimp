import Block from "./block.js";
import { cryptoHash } from "../crypto/index.js";
import Transaction from "./transaction.js";
import Wallet from "../wallet/index.js";
import {
  MINING_REWARD,
  MINING_REWARD_INPUT,
  HALVING_RATE,
  NONCE_ENFORCEMENT_INDEX,
  SOFT_FORK_INDEX,
} from "../config.js";
import Storage from "../storage/index.js";
import Miner from "../mining/miner.js";
import { stringify } from "../utils/json.js";
import GlobalState from "../store/state.js";
import SmartContract from "../smart-contract/contract.js";
import { TRANSACTION_TYPE } from "../config.js";

class Blockchain {
  constructor() {
    this.chain = [Block.genesis()];
    this.storage = new Storage();
    this.state = new GlobalState();
  }

  async init() {
    const savedChain = await this.storage.loadChain();
    if (savedChain && savedChain.length > 0) {
      // Validate Genesis Block match
      const loadedGenesis = savedChain[0];
      const codeGenesis = Block.genesis();

      const isGenesisValid =
        loadedGenesis.hash === codeGenesis.hash &&
        stringify(loadedGenesis.data) === stringify(codeGenesis.data);

      if (!isGenesisValid) {
        console.error(
          "⚠️  Saved chain has invalid genesis block. Resetting chain.",
        );
        await this.storage.clear();
        this.chain = [Block.genesis()];
        // Default state is empty (genesis has no tx usually, or pre-mine?)
        // If genesis has data, we should execute it? Genesis usually constant.
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

      // Rebuild State
      console.log("Building Global State...");
      this.rebuildState();
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

    // Update State
    this.executeBlock({ block: newBlock, state: this.state });

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
    if (!this.validateBlockData({ block })) {
      console.log(
        `⚠️  Rejecting block ${block.index}. Invalid transaction data.`,
      );
      return null;
    }

    this.chain.push(block);
    this.storage.saveChain(this.chain);

    // Update State
    this.executeBlock({ block, state: this.state });

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

  getChainSlice(start, end) {
    if (start < 0) start = 0;
    if (end > this.chain.length) end = this.chain.length;
    return this.chain.slice(start, end);
  }

  rebuildState() {
    this.state = new GlobalState(); // Reset
    for (let i = 1; i < this.chain.length; i++) {
      const block = this.chain[i];
      this.executeBlock({ block, state: this.state });
    }
  }

  executeBlock({ block, state }) {
    const sc = new SmartContract({ state });

    for (let transaction of block.data) {
      if (transaction.input.address === MINING_REWARD_INPUT.address) {
        // Handle Reward
        for (const [recipient, amount] of Object.entries(
          transaction.outputMap,
        )) {
          const acc = state.getAccount(recipient);
          acc.balance += BigInt(amount);
          state.putAccount({ address: recipient, accountData: acc });
        }
      } else {
        // 1. Regular Transfer Logic (Debit sender, Credit recipient)
        // GlobalState.commitTransaction handles basic transfer logic (balance/nonce)
        state.commitTransaction(transaction);

        // 2. Smart Contract Logic
        if (transaction.type === TRANSACTION_TYPE.CREATE_CONTRACT) {
          sc.createContract({
            code: transaction.data.code,
            sender: transaction.input.address,
            nonce: transaction.input.nonce,
          });
        } else if (transaction.type === TRANSACTION_TYPE.CALL_CONTRACT) {
          const contractAddress = Object.keys(transaction.outputMap)[0];
          sc.callContract({
            contractAddress,
            method: transaction.data.function,
            args: transaction.data.args,
            sender: transaction.input.address,
          });
        }
      }
    }
  }

  validTransactionData({ chain }) {
    // For full chain validation, strict verification
    // We should probably just rebuild state and catch errors?
    // But this method is usually called to validate an INCOMING chain.
    // So we use a TEMPORARY state.
    const tempState = new GlobalState();

    for (let i = 1; i < chain.length; i++) {
      const block = chain[i];
      if (!this.validateBlockData({ block, state: tempState })) {
        return false;
      }
    }
    return true;
  }

  validateBlockData({ block, state, chain }) {
    // If state not provided (e.g. single block check without context),
    // we must assume it accepts "state" as the current valid state for THIS block.
    // If no state provided, we might be in trouble or falling back to simple checks.
    // But let's assume `this.state` if validation is for the next block.

    // If 'chain' is provided, we might need to rebuild state up to that point?
    // Legacy signature: ({ block, chain, balanceMap... })
    // New signature: ({ block, state })

    let validationState = state;

    if (!validationState) {
      // If validating a new candidate block for OUR chain:
      // We use a clone of our current state.
      if (this.chain[this.chain.length - 1].hash === block.lastHash) {
        validationState = this.state.clone();
      } else {
        // If validating a block that doesn't fit?
        // Maybe validating a whole chain? 'validTransactionData' passes a tempState.
        console.error("Verification state missing for block validation");
        return false;
      }
    }

    const transactionSet = new Set();
    let rewardTransactionCount = 0;

    for (let transaction of block.data) {
      // reward validations...
      if (transaction.input.address === MINING_REWARD_INPUT.address) {
        rewardTransactionCount += 1;
        if (rewardTransactionCount > 1) return false;
        // ... (check amounts, similar to before) ...
        const expectedBaseReward = Miner.calculateReward(block.index);
        let totalFees = 0n;
        for (let tx of block.data) {
          if (tx.input.address !== MINING_REWARD_INPUT.address) {
            const inputAmount = BigInt(tx.input.amount);
            const outputAmount = Object.values(tx.outputMap).reduce(
              (a, b) => a + BigInt(b),
              0n,
            );
            totalFees += inputAmount - outputAmount;
          }
        }
        const actualReward = BigInt(Object.values(transaction.outputMap)[0]);
        if (actualReward !== expectedBaseReward + totalFees) {
          console.error(
            `Invalid miner reward. Got: ${actualReward}, Expected: ${expectedBaseReward + totalFees}`,
          );
          return false;
        }
      } else {
        // Validate Transaction
        if (!Transaction.validTransaction(transaction)) {
          console.error("Invalid transaction signature/structure");
          return false;
        }

        // Validate against State (Balance & Nonce)
        const senderAddr = transaction.input.address;
        const senderAccount = validationState.getAccount(senderAddr);

        // Nonce check
        if (block.index >= NONCE_ENFORCEMENT_INDEX) {
          if (transaction.input.nonce !== senderAccount.nonce) {
            console.error(
              `Invalid nonce. Expected ${senderAccount.nonce}, Got ${transaction.input.nonce}`,
            );
            return false;
          }
        }

        // Balance check
        // transaction.input.amount is "Total Spend"
        if (BigInt(transaction.input.amount) > senderAccount.balance) {
          // Soft fork check...
          if (block.index > SOFT_FORK_INDEX) {
            console.error("Insufficient balance");
            return false;
          }
        }

        if (transactionSet.has(transaction)) return false;
        transactionSet.add(transaction);
      }
    }

    // If structural validation passed, attempt EXECUTION on the temporary state.
    // If execution fails (e.g. contract throws), block is invalid.
    try {
      this.executeBlock({ block, state: validationState });
    } catch (e) {
      console.error(`Block execution failed: ${e.message}`);
      return false;
    }

    return true;
  }
  static isValidChain(chain) {
    const genesis = chain[0];
    const realGenesis = Block.genesis();

    const genesisProps = ["index", "timestamp", "lastHash", "hash", "data"];

    for (const key of genesisProps) {
      if (stringify(genesis[key]) !== stringify(realGenesis[key])) {
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
