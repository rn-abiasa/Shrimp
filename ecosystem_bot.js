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
import { toBaseUnits, fromBaseUnits } from "./src/config.js";
import { stringify } from "./src/utils/json.js";

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
    console.log("\x1b[36m%s\x1b[0m", "🤖 Initializing Ecosystem Bot...");
    console.log(`📊 Configuration:`, CONFIG);

    // Create or load bot wallets
    for (let i = 0; i < CONFIG.NUM_BOTS; i++) {
      const botName = `bot_${i + 1}`;
      let wallet;

      try {
        wallet = WalletManager.get(botName);
        console.log(`✅ Loaded existing bot: ${botName}`);
      } catch (e) {
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

    // Initialize node wallet (faucet source)
    try {
      this.nodeWallet = WalletManager.get("default");
      console.log(
        `🏦 Faucet source: default wallet (${this.nodeWallet.address.substring(0, 20)}...)`,
      );
    } catch (e) {
      console.log(
        "⚠️  'default' wallet not found. Bots must be funded manually.",
      );
      this.nodeWallet = null;
    }

    console.log(`\n✅ ${this.bots.length} bots ready!\n`);
  }

  async getBalanceData(publicKey) {
    try {
      const res = await fetch(
        `${CONFIG.NODE_API}/balance?address=${publicKey}`,
      );
      const data = await res.json();

      // API returns raw Base Units (BigInt string)
      // Convert to SHRIMP (float) for bot logic
      const rawConfirmed = BigInt(data.confirmed || data.balance || "0");
      const rawPending = BigInt(data.pending || data.balance || "0"); // pending might be same as balance if not present

      return {
        confirmed: parseFloat(fromBaseUnits(rawConfirmed)),
        pending: parseFloat(fromBaseUnits(rawPending)),
        balance: parseFloat(fromBaseUnits(rawConfirmed)), // Default to confirmed
        nonce: data.nonce,
      };
    } catch (e) {
      return { confirmed: 0, pending: 0, balance: 0 };
    }
  }

  async getBalance(publicKey) {
    const data = await this.getBalanceData(publicKey);
    return data.pending !== undefined ? data.pending : data.balance;
  }

  async sendTransaction(fromWallet, toBot, amount, label = "Transfer") {
    try {
      // Fetch latest chain and mempool for accurate balance
      const [blockRes, mempoolRes] = await Promise.all([
        fetch(`${CONFIG.NODE_API}/blocks`),
        fetch(`${CONFIG.NODE_API}/transactions`),
      ]);

      const chain = await blockRes.json();
      const mempoolMap = await mempoolRes.json();
      const transactionPool = { transactionMap: mempoolMap };

      // Convert amount and fee to BigInt base units
      const amountBI = toBaseUnits(amount);
      const feeBI = toBaseUnits(CONFIG.FEE);

      // Create and sign transaction locally
      const transaction = fromWallet.createTransaction({
        recipient: toBot.publicKey,
        amount: amountBI,
        fee: feeBI,
        chain,
        transactionPool,
      });

      // Broadcast to node
      const res = await fetch(`${CONFIG.NODE_API}/transact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: stringify({ transaction }),
      });

      const data = await res.json();

      if (data.type === "success") {
        const fromName = fromWallet.name || "MainNode";
        console.log(
          `\x1b[32m%s\x1b[0m`,
          `💸 ${fromName} → ${toBot.name}: ${amount} SHRIMP (${label})`,
        );
        return true;
      }
      return false;
    } catch (e) {
      console.error(`❌ ${label} error: ${e.message}`);
      return false;
    }
  }

  async runFaucet() {
    if (!this.nodeWallet) return;

    const nodeBalance = await this.getBalance(this.nodeWallet.publicKey);
    if (nodeBalance < (CONFIG.MAX_AMOUNT + CONFIG.FEE) * 2) return;

    // Check bots that need funding
    for (const bot of this.bots) {
      const balance = await this.getBalance(bot.publicKey);
      if (balance < CONFIG.MIN_AMOUNT * 5) {
        const amount = 500; // Standard funding amount
        console.log(`💧 Faucet funding ${bot.name}...`);
        await this.sendTransaction(this.nodeWallet, bot, amount, "Faucet");
        await new Promise((r) => setTimeout(r, 1000)); // Rate limit
      }
    }
  }

  async performRandomTransaction() {
    // 1. Run faucet if needed
    await this.runFaucet();

    // 2. Pick a random bot with balance
    const eligibleBots = [];
    for (const bot of this.bots) {
      const data = await this.getBalanceData(bot.publicKey);
      // Skip if bot has pending transactions to adhere to nonce/chian rules
      if (Math.abs(data.pending - data.confirmed) > 0.000001) {
        continue;
      }

      const balance = data.pending;
      if (balance >= CONFIG.MIN_AMOUNT + CONFIG.FEE) {
        eligibleBots.push({ ...bot, balance });
      }
    }

    if (eligibleBots.length === 0) {
      console.log(
        "😴 No bots have enough balance. Waiting for faucet/mining...",
      );
      return;
    }

    // Pick source and destination
    const fromBotIdx = Math.floor(Math.random() * eligibleBots.length);
    const fromBot = eligibleBots[fromBotIdx];

    // Pick target bot (could be any bot except sender)
    const possibleTargets = this.bots.filter(
      (b) => b.publicKey !== fromBot.publicKey,
    );
    const toBot =
      possibleTargets[Math.floor(Math.random() * possibleTargets.length)];

    const maxSend = Math.min(fromBot.balance - CONFIG.FEE, CONFIG.MAX_AMOUNT);
    const amount = parseFloat(
      (
        Math.random() * (maxSend - CONFIG.MIN_AMOUNT) +
        CONFIG.MIN_AMOUNT
      ).toFixed(2),
    );

    if (amount > 0) {
      await this.sendTransaction(fromBot.wallet, toBot, amount, "Bot-to-Bot");
    }
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("\x1b[35m%s\x1b[0m", "🚀 Ecosystem Bot started!\n");

    const loop = async () => {
      if (!this.isRunning) return;
      await this.performRandomTransaction();
      const nextInterval =
        Math.random() * (CONFIG.MAX_INTERVAL - CONFIG.MIN_INTERVAL) +
        CONFIG.MIN_INTERVAL;
      setTimeout(loop, nextInterval);
    };

    loop();
  }

  stop() {
    this.isRunning = false;
    console.log("\n🛑 Ecosystem Bot stopped.");
  }

  async showStatus() {
    console.log("\n📊 Ecosystem Status:\n");
    for (const bot of this.bots) {
      const balance = await this.getBalance(bot.publicKey);
      console.log(
        `${bot.name.padEnd(10)} | ${balance.toFixed(2).padStart(10)} SHRIMP | ${bot.publicKey.substring(0, 15)}...`,
      );
    }
    if (this.nodeWallet) {
      const bal = await this.getBalance(this.nodeWallet.publicKey);
      console.log(
        `${"MainNode".padEnd(10)} | ${bal.toFixed(2).padStart(10)} SHRIMP (Faucet Source)`,
      );
    }
    console.log("");
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
