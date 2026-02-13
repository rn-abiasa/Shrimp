#!/usr/bin/env node

/**
 * 🦐 ShrimpChain Ecosystem Bot v2
 *
 * Market Simulator with Trading, Meme Launches, and Market Cycles.
 */

import fetch from "node-fetch";
import WalletManager from "./src/wallet/manager.js";
import { toBaseUnits, fromBaseUnits } from "./src/config.js";
import { stringify } from "./src/utils/json.js";
import { cryptoHash } from "./src/crypto/index.js";

// Configuration
const CONFIG = {
  NODE_API: process.env.NODE_API || "http://127.0.0.1:3001",
  NUM_BOTS: parseInt(process.env.NUM_BOTS) || 12,
  MIN_INTERVAL: 1000,
  MAX_INTERVAL: 5000,
  AGRESSION: 0.7, // 0 to 1
  LAUNCH_CHANCE: 0.05, // 5% chance per main loop to launch a meme
  FEE: 10, // Base fee for transactions
};

const MARKET_CYCLES = {
  BULL: { name: "BULLISH 📈", buyWeight: 0.8, sellWeight: 0.2 },
  BEAR: { name: "BEARISH 📉", buyWeight: 0.2, sellWeight: 0.8 },
  SIDEWAY: { name: "SIDEWAY ↔️", buyWeight: 0.5, sellWeight: 0.5 },
};

class EcosystemBot {
  constructor() {
    this.bots = [];
    this.isRunning = false;
    this.marketCycle = MARKET_CYCLES.SIDEWAY;
    this.cycleTimer = 0;
  }

  async initialize() {
    console.log("\x1b[36m%s\x1b[0m", "🤖 Initializing Market Simulator...");

    for (let i = 0; i < CONFIG.NUM_BOTS; i++) {
      const name = `bot_${i + 1}`;
      let wallet;
      try {
        wallet = WalletManager.get(name);
      } catch (e) {
        wallet = WalletManager.create(name);
      }
      this.bots.push({
        name,
        wallet,
        address: wallet.address,
        publicKey: wallet.publicKey,
      });
    }

    try {
      this.faucetSource = WalletManager.get("abiasa.shrimp");
      console.log(
        `🏦 Faucet: ${this.faucetSource.address.substring(0, 10)}...`,
      );
    } catch (e) {
      console.warn("⚠️ No faucet source available.");
    }

    this.updateMarketCycle();
  }

  updateMarketCycle() {
    const cycles = Object.values(MARKET_CYCLES);
    this.marketCycle = cycles[Math.floor(Math.random() * cycles.length)];
    this.cycleTimer = Math.floor(Math.random() * 20) + 10; // 10-30 actions
    console.log(
      `\x1b[35m%s\x1b[0m`,
      `\n🌏 Market Shift: ${this.marketCycle.name} (Duration: ${this.cycleTimer} actions)\n`,
    );
  }

  async getConfirmedData(address) {
    try {
      const urls = [
        `${CONFIG.NODE_API}/balance?address=${address}`,
        `${CONFIG.NODE_API}/nonce?address=${address}`,
        `${CONFIG.NODE_API}/transactions`,
        `${CONFIG.NODE_API}/blocks`,
      ];
      const results = await Promise.all(urls.map((url) => fetch(url)));

      const [balRes, nonceRes, txRes, chainRes] = results;
      const balData = await balRes.json();
      const nonceData = await nonceRes.json();
      const mempool = await txRes.json();
      const chain = await chainRes.json();

      return {
        balance: BigInt(balData.balance || 0),
        nonce: nonceData.nonce,
        transactionPool: { transactionMap: mempool },
        chain,
      };
    } catch (e) {
      console.error(
        `❌ getConfirmedData error for ${address.substring(0, 10)}...: ${e.message} (${e.code || "No Code"})`,
      );
      return null;
    }
  }

  async broadcast(transaction) {
    try {
      const res = await fetch(`${CONFIG.NODE_API}/transact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: stringify({ transaction }),
      });
      const data = await res.json();
      if (data.type === "error") {
        console.error("❌ Broadcast Node Error:", data.message);
      }
      return data;
    } catch (e) {
      console.error(
        "❌ Broadcast Fetch Error:",
        e.message,
        `(${e.code || "No Code"})`,
      );
      return { type: "error", message: e.message };
    }
  }

  async getPools() {
    try {
      const res = await fetch(`${CONFIG.NODE_API}/api/explorer/contracts`);
      const data = await res.json();
      const found = data.contracts.filter(
        (c) =>
          c.metadata &&
          c.metadata.tokenBalance !== undefined &&
          c.metadata.tokenAddress,
      );
      return found;
    } catch (e) {
      console.error(
        "❌ getPools error:",
        e.message,
        `(${e.code || "No Code"})`,
      );
      return [];
    }
  }

  async fundBot(bot) {
    if (!this.faucetSource) return;
    const data = await this.getConfirmedData(bot.publicKey);
    const faucetData = await this.getConfirmedData(this.faucetSource.publicKey);
    if (!data || !faucetData) return;

    const balance = parseFloat(fromBaseUnits(data.balance));
    const faucetPending = parseFloat(
      fromBaseUnits(faucetData.pending || faucetData.balance),
    );

    if (balance > 100) return;
    if (faucetPending < 110) {
      // console.log("⏳ Faucet pending balance low, waiting for mining...");
      return;
    }

    console.log(`💧 Funding ${bot.name}... (Current: ${balance} SHRIMP)`);
    const tx = this.faucetSource.createTransaction({
      recipient: bot.publicKey,
      amount: toBaseUnits(100),
      fee: BigInt(CONFIG.FEE),
      chain: faucetData.chain,
      transactionPool: faucetData.transactionPool,
    });
    await this.broadcast(tx);
  }

  async trade(bot) {
    const pools = await this.getPools();
    if (pools.length === 0) {
      // console.log("⏳ No pools available for trading.");
      return;
    }

    const pool = pools[Math.floor(Math.random() * pools.length)];
    const isBuy = Math.random() < this.marketCycle.buyWeight;
    const data = await this.getConfirmedData(bot.publicKey);
    if (!data) return;

    if (isBuy) {
      const amount = toBaseUnits(Math.floor(Math.random() * 50) + 10);
      if (data.balance < amount + BigInt(CONFIG.FEE)) return;

      const sym = pool.metadata.symbol || pool.address.substring(0, 8);
      console.log(
        `🛒 ${bot.name} BUYING ${sym} with ${fromBaseUnits(amount)} SHRIMP`,
      );
      const tx = bot.wallet.createTransaction({
        recipient: pool.address,
        amount: amount,
        fee: BigInt(CONFIG.FEE),
        type: "CALL_CONTRACT",
        data: { function: "swap", args: [amount.toString()] },
        chain: data.chain,
        transactionPool: data.transactionPool,
      });
      await this.broadcast(tx);
    } else {
      const tokenBal = await this.getTokenBalance(
        bot.publicKey,
        pool.metadata.tokenAddress,
      );
      if (tokenBal < toBaseUnits(1)) return;

      const sellAmt = tokenBal / 2n;
      const sym = pool.metadata.symbol || pool.address.substring(0, 8);
      console.log(`💰 ${bot.name} SELLING ${sym}`);

      const tx1 = bot.wallet.createTransaction({
        recipient: pool.metadata.tokenAddress,
        amount: 0n,
        fee: BigInt(CONFIG.FEE),
        type: "CALL_CONTRACT",
        data: {
          function: "transfer",
          args: [pool.address, sellAmt.toString()],
        },
        chain: data.chain,
        transactionPool: data.transactionPool,
      });
      await this.broadcast(tx1);

      // We wait briefly for the transfer to hit mempool or just send sequential nonce
      const tx2 = bot.wallet.createTransaction({
        recipient: pool.address,
        amount: 0n,
        fee: BigInt(CONFIG.FEE),
        type: "CALL_CONTRACT",
        data: { function: "sell", args: [] },
        chain: data.chain,
        transactionPool: data.transactionPool,
        nonce: data.nonce + 1,
      });
      await this.broadcast(tx2);
    }
  }

  async getTokenBalance(user, token) {
    try {
      const res = await fetch(
        `${CONFIG.NODE_API}/api/explorer/address/${user}`,
      );
      const data = await res.json();
      if (!data.tokens) return 0n;
      const target = data.tokens.find(
        (t) => t.contractAddress?.toLowerCase() === token.toLowerCase(),
      );
      return target ? BigInt(target.balance || 0) : 0n;
    } catch (e) {
      return 0n;
    }
  }

  async launchMeme(bot) {
    const data = await this.getConfirmedData(bot.publicKey);
    if (!data || data.balance < toBaseUnits(2000)) return;

    const memeId = Math.floor(Math.random() * 899) + 100;
    const memeName = `MemeToken-${memeId}`;
    const memeSym = `MEME${memeId % 100}`;
    console.log(`🚀 ${bot.name} LAUNCHING ${memeName} (${memeSym})!`);

    const tokenCode = `class SmartContract { 
      init() { 
        this.state.initialSupply = "1000000000000"; 
        this.state.name = "${memeName}"; 
        this.state.symbol = "${memeSym}"; 
        this.state.owner = this.sender; 
        this.state.balances = {}; 
        this.state.balances[this.sender] = "1000000000000"; 
      }
      balanceOf(address) { return (this.state.balances[address] || "0").toString(); }
      transfer(to, amount) {
        const amt = BigInt(amount);
        const senderBal = BigInt(this.state.balances[this.sender] || 0);
        if (senderBal < amt) throw new Error("Insf");
        this.state.balances[this.sender] = (senderBal - amt).toString();
        this.state.balances[to] = (BigInt(this.state.balances[to] || 0) + amt).toString();
      }
    }`;

    // Deploy Token
    const txToken = bot.wallet.createTransaction({
      recipient: null,
      amount: 0n,
      fee: 100n,
      type: "CREATE_CONTRACT",
      data: { code: tokenCode },
      chain: data.chain,
      transactionPool: data.transactionPool,
    });
    await this.broadcast(txToken);
  }

  async mainLoop() {
    if (!this.isRunning) return;

    const bot = this.bots[Math.floor(Math.random() * this.bots.length)];

    try {
      if (Math.random() < CONFIG.LAUNCH_CHANCE) {
        await this.launchMeme(bot);
      } else {
        await this.fundBot(bot);
        await this.trade(bot);
      }
    } catch (e) {
      console.error(`❌ MainLoop Error (${bot.name}):`, e.message);
    }

    this.cycleTimer--;
    if (this.cycleTimer <= 0) this.updateMarketCycle();

    const delay =
      Math.random() * (CONFIG.MAX_INTERVAL - CONFIG.MIN_INTERVAL) +
      CONFIG.MIN_INTERVAL;
    setTimeout(() => this.mainLoop(), delay);
  }

  async start() {
    this.isRunning = true;
    await this.initialize();
    this.mainLoop();
    console.log("🚀 Market Simulator Active!");
  }

  stop() {
    this.isRunning = false;
  }
}

const bot = new EcosystemBot();
bot.start();

process.on("SIGINT", () => {
  bot.stop();
  process.exit();
});
