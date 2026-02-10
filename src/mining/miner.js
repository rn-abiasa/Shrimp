import Transaction from "../blockchain/transaction.js";
import { Worker } from "worker_threads";
import path from "path";
import { fileURLToPath } from "url";
import Block from "../blockchain/block.js";
import { MINING_REWARD, HALVING_RATE, MAX_BLOCK_SIZE } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Miner {
  constructor({ blockchain, transactionPool, wallet, p2pServer }) {
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.wallet = wallet;
    this.p2pServer = p2pServer;
    this.isAutoMining = false;
  }

  start() {
    this.isAutoMining = true;
    console.log("⛏️  Auto Mining started");
  }

  stop() {
    this.isAutoMining = false;
    console.log("🛑 Auto Mining stopped");
  }

  mine(minerAddress) {
    if (this.isMining) {
      console.log("Miner is already working. Skipping...");
      return;
    }

    let validTransactions = this.transactionPool.validTransactions();

    // Priority: explicit parameter > defaultMinerAddress > wallet.publicKey
    const rewardAddress =
      minerAddress || this.defaultMinerAddress || this.wallet.publicKey;

    // Validate that we have a valid reward address
    if (!rewardAddress) {
      console.error(
        "❌ Cannot mine: No wallet found. Please create or import a wallet first.",
      );
      return;
    }

    console.log(`⛏️  Mining to address: ${rewardAddress.substring(0, 20)}...`);

    // Create a dummy wallet object because rewardTransaction expects { minerWallet }
    // but only uses .publicKey
    const minerWallet = { publicKey: rewardAddress };

    // Calculate Block Reward (Halving)
    const currentHeight = this.blockchain.chain.length; // Index of new block will be length (since genesis is 0, next is 1.. wait. chain.length is next index)
    // Actually genesis is index 0. length is 1. Next block is index 1.
    // So currentHeight (length) IS the index of the block we are mining.
    const blockReward = Miner.calculateReward(currentHeight);

    // Calculate Fees
    // Calculate Fees
    let totalFees = 0;

    // Fee Prioritization:
    // 1. Calculate fee for each transaction
    validTransactions.forEach((tx) => {
      const inputAmount = tx.input.amount;
      const outputAmount = Object.values(tx.outputMap).reduce(
        (total, amt) => total + amt,
        0,
      );
      tx.fee = inputAmount - outputAmount;
    });

    // 2. Sort by Fee (Descending)
    validTransactions.sort((a, b) => b.fee - a.fee);

    // 3. Limit Block Size
    if (validTransactions.length > MAX_BLOCK_SIZE) {
      validTransactions = validTransactions.slice(0, MAX_BLOCK_SIZE);
    }

    // Recalculate total fees for the SELECTED transactions
    validTransactions.forEach((transaction) => {
      totalFees += transaction.fee;
      delete transaction.fee; // Cleanup temp property
    });

    const totalReward = blockReward + totalFees;

    validTransactions.push(
      Transaction.rewardTransaction({ minerWallet, amount: totalReward }),
    );

    const lastBlock = this.blockchain.chain[this.blockchain.chain.length - 1];

    this.isMining = true; // Set flag

    const worker = new Worker(
      path.resolve(__dirname, "../workers/mine-worker.js"),
      {
        workerData: {
          lastBlock,
          data: validTransactions,
        },
      },
    );

    worker.on("message", (minedBlockData) => {
      const newBlock = new Block(minedBlockData);
      const submittedBlock = this.blockchain.submitBlock(newBlock);

      // Check if block was rejected (null return)
      if (!submittedBlock) {
        console.log(
          "⚠️  Mined block was rejected (likely due to chain advancement from peer). Discarding.",
        );
        this.isMining = false;

        // If auto-mining, try again with updated chain
        if (
          this.isAutoMining &&
          this.transactionPool.validTransactions().length > 0
        ) {
          console.log("🔄 Restarting mining with updated chain...");
          this.mine();
        }
        return;
      }

      console.log("✅ Mined new block:", newBlock.hash);

      // Broadcast new block to all peers
      this.p2pServer.syncChains();

      // Clear local mempool (only remove transactions that are in the chain)
      // This ensures we keep pending transactions that weren't included in this block
      this.transactionPool.clearBlockchainTransactions({
        chain: this.blockchain.chain,
      });

      // DO NOT broadcast clear. Peers clears their own pool when they receive the new chain via syncChains().
      // this.p2pServer.broadcastClearTransactions();

      this.isMining = false; // Reset flag

      // Recursive Auto-Mining:
      // If we are in auto-mining mode and there are still valid transactions (that weren't cleared),
      // we immediately mine the next block!
      if (
        this.isAutoMining &&
        this.transactionPool.validTransactions().length > 0
      ) {
        this.mine();
      }
    });

    worker.on("error", (err) => {
      console.error("Miner worker error:", err);
      this.isMining = false;
    });

    worker.on("exit", (code) => {
      if (code !== 0) console.error(`Worker stopped with exit code ${code}`);
      this.isMining = false;
    });
  }

  static calculateReward(height) {
    // Halving logic: Reward / 2 ^ (height / rate)
    const halvings = Math.floor(height / HALVING_RATE);
    const reward = MINING_REWARD / Math.pow(2, halvings);
    return Math.max(1, reward); // Minimum 1 satoshi/wei equivalent so it never hits 0 absolutely? Or allow 0?
    // JavaScript numbers might get weird. Let's floor it or keep it float?
    // Let's keep it float for now but ideally integer.
  }
}

export default Miner;
