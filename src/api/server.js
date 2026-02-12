import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import util from "util";

import Blockchain from "../blockchain/chain.js";
import P2pServer from "../p2p/server.js";
import Wallet from "../wallet/index.js";
import TransactionPool from "../blockchain/mempool.js";
import Miner from "../mining/miner.js";
import ConfigManager from "../config/manager.js";
import { stringify } from "../utils/json.js";

import createSystemRoutes from "./routes/system.js";
import createPublicRoutes from "./routes/public.js";

const app = express();
const config = ConfigManager.load();
const HTTP_PORT = process.env.HTTP_PORT || config.HTTP_PORT;

// Log capturing mechanism (Keep in server.js as it's the entry point)
const logBuffer = [];
const MAX_LOGS = 200;

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
    // Prevent infinite loops if logging fails
    process.stdout.write(`Error in captureLog: ${err}\n`);
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
  // Connect mempool to blockchain for validation
  transactionPool.setBlockchain(blockchain);
  const p2pServer = new P2pServer(blockchain, transactionPool);
  const miner = new Miner({ blockchain, transactionPool, wallet, p2pServer });

  // CRITICAL: Clear mempool if blockchain is at genesis (fresh start or reset)
  // This prevents stale transactions from causing "invalid input amount" errors
  if (blockchain.chain.length === 1) {
    console.log("🧹 Clearing mempool (blockchain at genesis state)");
    transactionPool.clear();
  }

  // Periodic Chain Health Check
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

    // Middleware to support BigInt in res.json
    const originalJson = res.json;
    res.json = function (data) {
      // Use custom stringify to handle BigInt
      const jsonStr = stringify(data);
      res.setHeader("Content-Type", "application/json");
      return res.send(jsonStr);
    };

    next();
  });
  app.use(bodyParser.json());

  // Mount System Routes (Internal)
  app.use(
    "/",
    createSystemRoutes({
      blockchain,
      transactionPool,
      wallet,
      p2pServer,
      miner,
      logBuffer,
    }),
  );

  // Mount Public Routes (External)
  app.use(
    "/",
    createPublicRoutes({
      blockchain,
      transactionPool,
      wallet,
      p2pServer,
      miner,
    }),
  );

  app.listen(HTTP_PORT, () => {
    console.log(`Listening on port ${HTTP_PORT}`);
  });

  p2pServer.listen();
}

initializeServer();
