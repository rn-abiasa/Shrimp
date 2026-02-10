#!/usr/bin/env node

/**
 * 🦐 ShrimpChain Ecosystem Bot
 *
 * Simulates blockchain activity by creating NPC wallets and performing
 * realistic transactions to make the network appear active and populated.
 *
 * Features:
 * - Creates multiple NPC wallets
 * - Performs random transfers between NPCs
 * - Simulates realistic transaction patterns
 * - Configurable activity levels
 */

import fetch from "node-fetch";
import WalletManager from "./src/wallet/manager.js";

// Configuration
const CONFIG = {
  NODE_API: process.env.NODE_API || "http://localhost:3001",
  NUM_BOTS: parseInt(process.env.NUM_BOTS) || 10,
  MIN_INTERVAL: parseInt(process.env.MIN_INTERVAL) || 500, // 10s
  MAX_INTERVAL: parseInt(process.env.MAX_INTERVAL) || 2000, // 30s
  MIN_AMOUNT: parseFloat(process.env.MIN_AMOUNT) || 1,
  MAX_AMOUNT: parseFloat(process.env.MAX_AMOUNT) || 100,
  FEE: parseFloat(process.env.FEE) || 1,
};

class EcosystemBot {
  constructor() {
    this.bots = [];
    this.isRunning = false;
    this.currentBotIndex = 0;
  }

  async initialize() {
    console.log("🤖 Initializing Ecosystem Bot...");
    console.log(`📊 Configuration:`, CONFIG);

    // Create or load bot wallets
    for (let i = 0; i < CONFIG.NUM_BOTS; i++) {
      const botName = `bot_${i + 1}`;
      let wallet;

      try {
        // Try to load existing bot wallet
        wallet = WalletManager.get(botName);
        console.log(`✅ Loaded existing bot: ${botName}`);
      } catch (e) {
        // Create new bot wallet if doesn't exist
        wallet = WalletManager.create(botName);
        console.log(
          `🆕 Created new bot: ${botName} (${wallet.address.substring(0, 20)}...)`,
        );
      }

      this.bots.push({
        name: botName,
        wallet,
        publicKey: wallet.publicKey,
        address: wallet.address,
      });
    }

    console.log(`\n✅ ${this.bots.length} bots ready!\n`);
  }

  async getBalance(publicKey) {
    try {
      const res = await fetch(
        `${CONFIG.NODE_API}/balance?address=${publicKey}`,
      );
      const data = await res.json();
      return data.balance || 0;
    } catch (e) {
      console.error(`❌ Failed to fetch balance: ${e.message}`);
      return 0;
    }
  }

  async sendTransaction(fromBot, toBot, amount) {
    try {
      const balance = await this.getBalance(fromBot.publicKey);

      if (balance < amount + CONFIG.FEE) {
        console.log(
          `⚠️  ${fromBot.name} has insufficient balance (${balance} SHRIMP)`,
        );
        return false;
      }

      // Fetch the blockchain to calculate accurate balance
      const chainRes = await fetch(`${CONFIG.NODE_API}/blocks`);
      const chain = await chainRes.json();

      // Fetch mempool for accurate balance calculation with pending transactions
      const mempoolRes = await fetch(`${CONFIG.NODE_API}/transactions`);
      const mempoolMap = await mempoolRes.json();

      // Create mock transactionPool object for balance calculation
      const transactionPool = { transactionMap: mempoolMap };

      // Create and sign transaction locally with chain and mempool for accurate balance
      const transaction = fromBot.wallet.createTransaction({
        recipient: toBot.publicKey,
        amount,
        fee: CONFIG.FEE,
        chain, // Pass chain for balance calculation
        transactionPool, // Pass mempool for accurate pending tx consideration
      });

      // Broadcast to node
      const res = await fetch(`${CONFIG.NODE_API}/transact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction }),
      });

      const data = await res.json();

      if (data.type === "success") {
        console.log(
          `💸 ${fromBot.name} → ${toBot.name}: ${amount} SHRIMP (Fee: ${CONFIG.FEE})`,
        );
        return true;
      } else {
        console.error(`❌ Transaction failed: ${data.message}`);
        return false;
      }
    } catch (e) {
      console.error(`❌ Transaction error: ${e.message}`);
      return false;
    }
  }

  getRandomBot() {
    return this.bots[Math.floor(Math.random() * this.bots.length)];
  }

  getRandomAmount() {
    return (
      Math.random() * (CONFIG.MAX_AMOUNT - CONFIG.MIN_AMOUNT) +
      CONFIG.MIN_AMOUNT
    );
  }

  getRandomInterval() {
    return (
      Math.random() * (CONFIG.MAX_INTERVAL - CONFIG.MIN_INTERVAL) +
      CONFIG.MIN_INTERVAL
    );
  }

  async performRandomTransaction() {
    // Sequential transfer: bot_1 -> bot_2 -> bot_3 -> ... -> bot_1
    const currentIndex = this.currentBotIndex;
    const nextIndex = (currentIndex + 1) % this.bots.length;

    const fromBot = this.bots[currentIndex];
    const toBot = this.bots[nextIndex];

    this.currentBotIndex = nextIndex;

    const amount = parseFloat(this.getRandomAmount().toFixed(2));

    await this.sendTransaction(fromBot, toBot, amount);
  }

  async start() {
    if (this.isRunning) {
      console.log("⚠️  Bot is already running!");
      return;
    }

    this.isRunning = true;
    console.log("🚀 Ecosystem Bot started!\n");

    const loop = async () => {
      if (!this.isRunning) return;

      await this.performRandomTransaction();

      const nextInterval = this.getRandomInterval();
      console.log(
        `⏱️  Next transaction in ${(nextInterval / 1000).toFixed(1)}s\n`,
      );

      setTimeout(loop, nextInterval);
    };

    loop();
  }

  stop() {
    this.isRunning = false;
    console.log("\n🛑 Ecosystem Bot stopped.");
  }

  async showStatus() {
    console.log("\n📊 Bot Status:\n");
    for (const bot of this.bots) {
      const balance = await this.getBalance(bot.publicKey);
      console.log(
        `${bot.name.padEnd(10)} | Balance: ${balance.toLocaleString().padStart(10)} SHRIMP`,
      );
      console.log(`${"".padEnd(10)} | PublicKey: ${bot.publicKey}`);
      console.log("");
    }
  }
}

// Main execution
async function main() {
  const bot = new EcosystemBot();

  try {
    await bot.initialize();
    await bot.showStatus();

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      bot.stop();
      process.exit(0);
    });

    // Start the bot
    await bot.start();
  } catch (e) {
    console.error("❌ Fatal error:", e);
    process.exit(1);
  }
}

main();
