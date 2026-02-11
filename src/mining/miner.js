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
          a.input.amount -
          Object.values(a.outputMap).reduce((s, v) => s + v, 0);
        const feeB =
          b.input.amount -
          Object.values(b.outputMap).reduce((s, v) => s + v, 0);
        return feeB - feeA;
      });

      const best = candidates.shift();
      const addr = best.input.address;
      const expectedNonce = expectedNonces[addr] || 0;
      const txNonce = best.input.nonce || 0;

      // Check nonce validity
      if (txNonce !== expectedNonce) {
        console.log(
          `⚠️  Miner skipping transaction ${best.id} from ${addr.substring(0, 20)}... - wrong nonce. Expected: ${expectedNonce}, Got: ${txNonce}`,
        );
        // Skip all remaining transactions from this sender (they'll have wrong nonces too)
        continue;
      }

      // Validate transaction against current state
      const dummyBlock = {
        index: this.blockchain.chain.length,
        data: [...selectedTransactions, best],
      };

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
        console.log(
          `⚠️  Miner skipping transaction ${best.id} from ${addr.substring(0, 20)}... - invalid balance for current block.`,
        );
        // If this transaction is invalid, subsequent transactions from this sender are also likely invalid
        // since they depend on the change of this one.
      }
    }

    validTransactions = selectedTransactions;

    let totalFees = 0;

    // Recalculate total fees for the SELECTED transactions
    validTransactions.forEach((transaction) => {
      const fee =
        transaction.input.amount -
        Object.values(transaction.outputMap).reduce((s, v) => s + v, 0);
      totalFees += fee;
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
