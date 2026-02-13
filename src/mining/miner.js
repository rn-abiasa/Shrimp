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

    // Nonce-based Transaction Selection (Ethereum-style):
    // 1. Group transactions by sender
    const txBySender = {};
    validTransactions.forEach((tx) => {
      const addr = tx.input.address;
      if (!txBySender[addr]) txBySender[addr] = [];
      txBySender[addr].push(tx);
    });

    // 2. Sort each sender's transactions by NONCE (not timestamp)
    Object.values(txBySender).forEach((txs) => {
      txs.sort((a, b) => (a.input.nonce || 0) - (b.input.nonce || 0));
    });

    // 3. Calculate expected nonce for each address from blockchain history
    const expectedNonces = {};
    for (let i = 1; i < this.blockchain.chain.length; i++) {
      const block = this.blockchain.chain[i];
      for (let tx of block.data) {
        if (tx.input.address !== "*authorized-reward*") {
          const addr = tx.input.address;
          expectedNonces[addr] = Math.max(
            expectedNonces[addr] || 0,
            (tx.input.nonce || 0) + 1,
          );
        }
      }
    }

    // 4. Select transactions respecting nonce order and maximizing fees
    let selectedTransactions = [];
    let candidates = Object.values(txBySender).map((txs) => txs[0]);

    while (
      selectedTransactions.length < MAX_BLOCK_SIZE &&
      candidates.length > 0
    ) {
      // Sort candidates by fee (input - totalOutput)
      candidates.sort((a, b) => {
        const feeA =
          BigInt(a.input.amount) -
          Object.values(a.outputMap).reduce((s, v) => s + BigInt(v), 0n);
        const feeB =
          BigInt(b.input.amount) -
          Object.values(b.outputMap).reduce((s, v) => s + BigInt(v), 0n);

        if (feeB > feeA) return 1;
        if (feeB < feeA) return -1;
        return 0;
      });

      const best = candidates.shift();
      const addr = best.input.address;
      const expectedNonce = expectedNonces[addr] || 0;
      const txNonce = best.input.nonce || 0;

      // Check nonce validity
      if (txNonce !== expectedNonce) {
        if (txNonce < expectedNonce) {
          console.log(
            `🗑️  Miner removing old transaction ${best.id.substring(0, 8)}... ` +
              `Expected: ${expectedNonce}, Got: ${txNonce}. Clearing from mempool.`,
          );
          delete this.transactionPool.transactionMap[best.id];
        } else {
          console.log(
            `⚠️  Miner skipping transaction ${best.id.substring(0, 8)}... from ` +
              `${addr.substring(0, 20)}... - wrong nonce (Gap detected). Expected: ${expectedNonce}, Got: ${txNonce}`,
          );
        }
        // Skip all remaining transactions from this sender
        continue;
      }

      // Validate transaction against current state
      const lastBlock = this.blockchain.chain[this.blockchain.chain.length - 1];
      const dummyBlock = {
        index: this.blockchain.chain.length,
        lastHash: lastBlock.hash,
        data: [...selectedTransactions, best],
      };

      try {
        if (
          this.blockchain.validateBlockData({
            block: dummyBlock,
            chain: this.blockchain.chain,
          })
        ) {
          selectedTransactions.push(best);
          expectedNonces[addr] = txNonce + 1; // Update expected nonce for next transaction

          // Add the next transaction from that same sender as a candidate
          const senderTxs = txBySender[addr];
          senderTxs.shift(); // Remove the one we just picked
          if (senderTxs.length > 0) {
            candidates.push(senderTxs[0]);
          }
        } else {
          // If it returns false without throwing (legacy/structural check fail)
          throw new Error("Validation structural check failed");
        }
      } catch (e) {
        console.log(
          `🗑️  Miner removing toxic transaction ${best.id.substring(0, 8)}... - ` +
            `Reason: ${e.message}. Clearing from mempool.`,
        );
        delete this.transactionPool.transactionMap[best.id];
      }
    }

    validTransactions = selectedTransactions;

    let totalFees = 0n;

    // Recalculate total fees for the SELECTED transactions
    validTransactions.forEach((transaction) => {
      const inputAmount = BigInt(transaction.input.amount);
      const outputAmount = Object.values(transaction.outputMap).reduce(
        (s, v) => s + BigInt(v),
        0n,
      );
      totalFees += inputAmount - outputAmount;
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

      // Clear any transactions that are now invalid after the new block
      this.transactionPool.clearInvalidTransactions({
        chain: this.blockchain.chain,
      });

      // DO NOT broadcast clear. Peers clears their own pool when they receive the new chain via syncChains().
      // this.p2pServer.broadcastClearTransactions();

      this.isMining = false; // Reset flag

      // Recursive Auto-Mining:
      // If we are in auto-mining mode and there are still valid transactions (that weren't cleared),
      // we immediately mine the next block!
      const remainingTxs = this.transactionPool.validTransactions();
      if (this.isAutoMining && remainingTxs.length > 0) {
        // If the last block was empty (only reward), add a small delay to avoid tight loop
        const wasEmpty = newBlock.data.length <= 1;
        if (wasEmpty) {
          console.log(
            "⏳ No transactions mined. Waiting 5s before next attempt...",
          );
          setTimeout(() => this.mine(), 5000);
        } else {
          this.mine();
        }
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
    // Use BigInt power
    const divisor = 2n ** BigInt(halvings);
    const reward = MINING_REWARD / divisor;
    return reward > 0n ? reward : 0n;
  }
}

export default Miner;
