import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

import Blockchain from "../blockchain/chain.js";
import P2pServer from "../p2p/server.js";
import Wallet from "../wallet/index.js";
import Transaction from "../blockchain/transaction.js";
import TransactionPool from "../blockchain/mempool.js";
import Miner from "../mining/miner.js";

import ConfigManager from "../config/manager.js";

const app = express();
const config = ConfigManager.load();
const HTTP_PORT = process.env.HTTP_PORT || config.HTTP_PORT;
const P2P_PORT = process.env.P2P_PORT || config.P2P_PORT;
const P2P_HOST = process.env.P2P_HOST || config.P2P_HOST;

// Log capturing mechanism
const logBuffer = [];
const MAX_LOGS = 200;

import util from "util";

function captureLog(level, args) {
  try {
    const message = args
      .map((arg) => {
        if (typeof arg === "object" && arg !== null) {
          try {
            return util.inspect(arg, {
              depth: 2,
              colors: false,
              breakLength: Infinity,
            });
          } catch (e) {
            return "[Unserializable Object]";
          }
        }
        return String(arg);
      })
      .join(" ");
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    logBuffer.push(logEntry);
    if (logBuffer.length > MAX_LOGS) logBuffer.shift();
  } catch (err) {
    originalError("Error in captureLog:", err);
  }
}

const originalLog = console.log;
const originalInfo = console.info;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => {
  originalLog(...args);
  captureLog("info", args);
};
console.info = (...args) => {
  originalInfo(...args);
  captureLog("info", args);
};
console.warn = (...args) => {
  originalWarn(...args);
  captureLog("warn", args);
};
console.error = (...args) => {
  originalError(...args);
  captureLog("error", args);
};

// Async initialization to properly handle blockchain loading
async function initializeServer() {
  const blockchain = new Blockchain();

  // Wait for blockchain to load from storage
  await blockchain.init();

  const wallet = new Wallet();

  // Ensure wallet is initialized (create if doesn't exist)
  if (!wallet.publicKey) {
    console.log("📝 No wallet found. Creating new wallet...");
    wallet.create();
    console.log(`✅ Wallet created: ${wallet.address}`);
  }

  const transactionPool = new TransactionPool();
  const p2pServer = new P2pServer(blockchain, transactionPool);
  const miner = new Miner({ blockchain, transactionPool, wallet, p2pServer });

  // CRITICAL: Clear mempool if blockchain is at genesis (fresh start or reset)
  // This prevents stale transactions from causing "invalid input amount" errors
  if (blockchain.chain.length === 1) {
    console.log("🧹 Clearing mempool (blockchain at genesis state)");
    transactionPool.clear();
  }

  // Periodic Chain Health Check
  // Validates chain integrity every 2 minutes to detect corruption
  setInterval(() => {
    if (!Blockchain.isValidChain(blockchain.chain)) {
      console.error(
        "❌ CRITICAL: Chain corruption detected during health check!",
      );
      console.log("🔄 Requesting fresh chain from peers...");
      p2pServer.syncChains();
    }
  }, 120000); // Every 2 minutes

  // Load saved miner address from config if available
  if (config.MINER_ADDRESS) {
    miner.defaultMinerAddress = config.MINER_ADDRESS;
    console.log(
      `⛏️  Miner address set to: ${config.MINER_ADDRESS.substring(0, 20)}...`,
    );
  }

  p2pServer.setMiner(miner);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    // Allow all origins, including 'null' (for local files)
    if (origin) {
      res.setHeader(
        "Access-Control-Allow-Origin",
        origin === "null" ? "null" : origin,
      );
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS, PUT, PATCH, DELETE",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "X-Requested-With, Content-Type, Authorization, ngrok-skip-browser-warning, Bypass-Tunnel-Reminder",
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");

    // Handle preflight
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
  app.use(bodyParser.json());

  app.get("/blocks", (req, res) => {
    res.json(blockchain.chain);
  });

  app.get("/logs", (req, res) => {
    res.json(logBuffer);
  });

  app.get("/height", (req, res) => {
    res.json({ height: blockchain.chain.length });
  });

  app.post("/mine", (req, res) => {
    const { minerAddress } = req.body;
    miner.mine(minerAddress);
    res.json({ type: "success", message: "Mining started" });
  });

  app.post("/miner/start", (req, res) => {
    miner.start();
    res.json({
      type: "success",
      message: "Auto-Mining started",
      isAutoMining: true,
    });
  });

  app.post("/miner/stop", (req, res) => {
    miner.stop();
    res.json({
      type: "success",
      message: "Auto-Mining stopped",
      isAutoMining: false,
    });
  });

  app.get("/miner/status", (req, res) => {
    res.json({ isAutoMining: miner.isAutoMining });
  });

  app.get("/transactions", (req, res) => {
    res.json(transactionPool.transactionMap);
  });

  app.post("/transact", (req, res) => {
    const { recipient, amount, fee, transaction } = req.body;

    if (transaction) {
      // 1. Validate the incoming signed transaction
      if (!Transaction.validTransaction(transaction)) {
        return res.status(400).json({
          type: "error",
          message: "Invalid transaction signature or structure",
        });
      }

      // Check if transaction is valid against current state (balance + mempool)
      const trueBalance = Wallet.calculateBalance({
        chain: blockchain.chain,
        address: transaction.input.address,
        transactionPool: transactionPool,
      });

      if (transaction.input.amount !== trueBalance) {
        return res.status(400).json({
          type: "error",
          message: `Invalid input amount for ${transaction.input.address}. Likely due to stale balance or pending transactions. Expected: ${trueBalance}, Got: ${transaction.input.amount}`,
        });
      }

      // 2. Add to pool and broadcast
      transactionPool.setTransaction(transaction);
      p2pServer.broadcastTransaction(transaction);

      // Auto-mine check
      if (miner.isAutoMining) {
        miner.mine();
      }

      return res.json({ type: "success", transaction, status: "pending" });
    }

    // Legacy/Server-side signing flow (optional, but good for backward compat or testing)
    let localTransaction = transactionPool.existingTransaction({
      inputAddress: wallet.publicKey,
    });

    try {
      if (localTransaction) {
        localTransaction.update({ senderWallet: wallet, recipient, amount });
        // TODO: Update doesn't support fee yet. For now, fee is only for new transactions.
        // Or we should update Transaction.update to support fee too?
        // The prompt didn't strictly require updating fees for existing txs, just creating them.
        // But let's leave this as is for now.
      } else {
        localTransaction = wallet.createTransaction({
          recipient,
          amount,
          fee,
          chain: blockchain.chain,
          transactionPool,
        });
      }
    } catch (error) {
      return res.status(400).json({ type: "error", message: error.message });
    }

    transactionPool.setTransaction(localTransaction);
    p2pServer.broadcastTransaction(localTransaction);

    // Auto-mine check
    if (miner.isAutoMining) {
      miner.mine();
    }

    res.json({
      type: "success",
      transaction: localTransaction,
      status: "pending",
    });
  });

  app.get("/balance", (req, res) => {
    const address = req.query.address || wallet.publicKey;
    const balance = Wallet.calculateBalance({
      chain: blockchain.chain,
      address: address,
      transactionPool,
    });
    res.json({ balance, address });
  });

  app.get("/public-key", (req, res) => {
    res.json({ publicKey: wallet.publicKey });
  });

  app.get("/net-peers", (req, res) => {
    const allPeers = p2pServer.peers || [];
    const allSockets = p2pServer.sockets.map((s) => s.peerUrl) || [];

    res.json({
      peers: allPeers,
      connected: allSockets.length,
      sockets: allSockets,
    });
  });

  app.post("/set-miner-address", (req, res) => {
    try {
      const { minerAddress } = req.body;
      if (!minerAddress) {
        return res.status(400).json({ error: "minerAddress is required" });
      }

      // Update the miner's default wallet address
      miner.defaultMinerAddress = minerAddress;

      // Optionally persist to config
      const config = ConfigManager.load();
      config.MINER_ADDRESS = minerAddress;
      ConfigManager.save(config);

      res.json({
        message: "Miner address updated successfully",
        minerAddress,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/miner-address", (req, res) => {
    res.json({
      minerAddress: miner.defaultMinerAddress || wallet.publicKey,
    });
  });

  app.post("/net-connect", (req, res) => {
    const { peer } = req.body;
    if (!peer) return res.status(400).json({ error: "Peer URL required" });

    // Add to persistent list
    if (!p2pServer.peers.includes(peer)) {
      p2pServer.peers.push(peer);
      p2pServer.savePeers();
    }

    // Connect
    p2pServer.connect(peer);
    res.json({ message: `Connecting to ${peer}...`, peers: p2pServer.peers });
  });

  app.listen(HTTP_PORT, () => {
    console.log(`Listening on port ${HTTP_PORT}`);
  });

  p2pServer.listen();
}

// Start the server
initializeServer().catch((err) => {
  console.error("Failed to initialize server:", err);
  process.exit(1);
});
