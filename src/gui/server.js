import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import expressLayouts from "express-ejs-layouts";
import WalletManager from "../wallet/manager.js";
import Wallet from "../wallet/index.js";
import Transaction from "../blockchain/transaction.js";
import ConfigManager from "../config/manager.js";
import { MINING_REWARD, HALVING_RATE, UNIT_MULTIPLIER } from "../config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.GUI_PORT || 3002;

app.use(cors());
app.use(express.json());
app.use(expressLayouts);

// Set EJS as view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("layout", "layout");

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Redirect root to dashboard
app.get("/", (req, res) => {
  res.redirect("/dashboard");
});

// Helper to get common data for rendering
async function getCommonData(req) {
  let wallets = [];
  try {
    wallets = WalletManager.list().map((name) => ({ name }));
  } catch (e) {
    console.error("WalletManager.list failed:", e.message);
  }

  const config = ConfigManager.load();
  const nodeApiUrl = process.env.NODE_API_URL || "http://localhost:3001";
  const activeWalletName =
    req.query.wallet || (wallets.length > 0 ? wallets[0].name : null);

  let nodeStatus = { connected: false, peers: 0 };
  let peersList = [];
  try {
    const response = await fetch(`${nodeApiUrl}/net-peers`);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const data = await response.json();
    nodeStatus = { connected: true, peers: data.connected || 0 };
    peersList = data.sockets || [];
  } catch (e) {
    console.error(
      `[Node Connectivity] Failed to reach Node API at ${nodeApiUrl}: ${e.message}`,
    );
  }

  let miningData = { height: 0, reward: 0, halvingCycle: 0, nextHalving: 0 };
  try {
    const bResponse = await fetch(`${nodeApiUrl}/height`);
    const data = await bResponse.json();
    const height = data.height;
    const cycle = Math.floor(height / HALVING_RATE);
    const reward = Math.max(1, MINING_REWARD / Math.pow(2, cycle));
    const nextHalving = (cycle + 1) * HALVING_RATE - height;

    miningData = { height, reward, halvingCycle: cycle, nextHalving };
  } catch (e) {
    console.error("Failed to fetch mining data:", e.message);
  }

  let walletDetails = null;
  if (activeWalletName) {
    try {
      const wallet = WalletManager.get(activeWalletName);
      let balance = 0;
      let confirmedBalance = 0;
      let pendingBalance = 0;
      let hasPending = false;

      try {
        const bResponse = await fetch(
          `${nodeApiUrl}/balance?address=${wallet.publicKey}`,
        );
        const bData = await bResponse.json();
        // Use confirmed balance (spendable)
        balance = parseFloat(
          (bData.confirmed || bData.balance || 0).toFixed(4),
        );
        confirmedBalance = parseFloat(
          (bData.confirmed || bData.balance || 0).toFixed(4),
        );
        pendingBalance = parseFloat(
          (bData.pending || bData.balance || 0).toFixed(4),
        );
        hasPending = confirmedBalance !== pendingBalance;
      } catch (e) {
        balance = wallet.balance || 0;
        confirmedBalance = balance;
        pendingBalance = balance;
      }

      walletDetails = {
        name: wallet.name,
        address: wallet.publicKey,
        balance: balance,
        confirmedBalance: confirmedBalance,
        pendingBalance: pendingBalance,
        hasPending: hasPending,
        mnemonic: wallet.mnemonic,
      };
    } catch (e) {}
  }

  return {
    wallets,
    config,
    nodeStatus,
    peersList,
    activeWallet: activeWalletName,
    walletDetails,
    miningData,
  };
}

// Routes
app.get("/", (req, res) => res.redirect("/dashboard"));

app.get("/dashboard", async (req, res) => {
  const data = await getCommonData(req);
  res.render("dashboard", { ...data, page: "dashboard" });
});

app.get("/wallets", async (req, res) => {
  const data = await getCommonData(req);
  res.render("wallets", { ...data, page: "wallets" });
});

app.get("/transfer", async (req, res) => {
  const data = await getCommonData(req);
  res.render("transfer", { ...data, page: "transfer" });
});

app.get("/mining", async (req, res) => {
  const data = await getCommonData(req);
  res.render("mining", { ...data, page: "mining" });
});

app.get("/logs", async (req, res) => {
  const data = await getCommonData(req);
  res.render("logs", { ...data, page: "logs" });
});

app.get("/settings", async (req, res) => {
  const data = await getCommonData(req);
  res.render("settings", { ...data, page: "settings" });
});

// WALLET API (Bridge to WalletManager)
app.get("/api/wallets", (req, res) => {
  try {
    const wallets = WalletManager.list();
    res.json(wallets);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/wallets/create", (req, res) => {
  try {
    const { name } = req.body;
    if (!name) throw new Error("Name is required");
    const wallet = WalletManager.create(name);
    res.json({
      name: wallet.name,
      publicKey: wallet.publicKey,
      mnemonic: wallet.mnemonic,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/wallets/import", (req, res) => {
  try {
    const { name, mnemonic } = req.body;
    if (!name || !mnemonic) throw new Error("Name and mnemonic required");
    const wallet = WalletManager.import(name, mnemonic);
    res.json({ name: wallet.name, publicKey: wallet.publicKey });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/wallets/:name", (req, res) => {
  try {
    const { name } = req.params;
    const wallet = WalletManager.get(name);
    res.json({
      name: wallet.name,
      publicKey: wallet.publicKey,
      balance: wallet.balance, // Local balance might be stale, frontend should fetch from Node API
    });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.get("/api/wallets/:name/mnemonic", (req, res) => {
  try {
    const { name } = req.params;
    const wallet = WalletManager.get(name);
    // Security: In a real remote server, this is dangerous.
    // Since this is a local GUI server (localhost), it's acceptable for "export" feature.
    if (!wallet.mnemonic) {
      return res.status(404).json({
        error: "No mnemonic found for this wallet (maybe imported via key?)",
      });
    }
    res.json({ mnemonic: wallet.mnemonic });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.get("/api/config", (req, res) => {
  try {
    const config = ConfigManager.load();
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/config", (req, res) => {
  try {
    const newConfig = req.body;
    ConfigManager.save(newConfig);
    res.json({ message: "Configuration saved. Please restart the node." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/wallets/:name", (req, res) => {
  try {
    const { name } = req.params;
    WalletManager.delete(name);
    res.json({ message: `Wallet ${name} deleted` });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.get("/api/wallets/:name/sign", (req, res) => {
  // Normally signing requires POST with data.
  // But for this simplified GUI, we might want the backend to sign transactions?
  // Actually, the CLI logic does: Wallet creates tx -> signs locally -> broadcasts.
  // The GUI frontend can't sign locally because it doesn't have the private key (unless we send it).
  // SECURITY: Sending private keys to frontend is bad practice, but for a local "Desktop App", it's acceptable-ish.
  // BETTER: Frontend sends "create transaction" request to THIS server -> THIS server signs -> Returns signed TX -> Frontend broadcasts to Node.
  res.status(501).json({ error: "Use POST /api/sign-transaction" });
});

app.post("/api/sign-transaction", async (req, res) => {
  try {
    const { walletName, recipient, amount, chain } = req.body;
    const wallet = WalletManager.get(walletName);

    // We need the latest chain to calculate balance correcty?
    // Actually Wallet.createTransaction takes 'chain' to calculate balance.
    // The frontend should pass the chain? No, that's huge.
    // The WalletManager/Wallet class calculates balance by looking at the chain.
    // BUT this GUI server doesn't necessarily have the chain sync'd!
    // It's just a wallet manager.

    // WORKAROUND:
    // The Frontend (which talks to Node API) knows the balance.
    // We can trust the frontend to say "I have money"? No.
    // validTransaction check on Node will fail if balance is insufficient.
    // So we just need to CREATE the transaction object with the correct inputs.

    // Wallet.createTransaction logic:
    // 1. Calculate balance (needs chain)
    // 2. Check balance >= amount
    // 3. Create inputs/outputs & Sign

    // If we don't have the chain here, we can't calculate balance locally easily.
    // Options:
    // A. GUI Server also runs a P2P node (heavy).
    // B. GUI Server fetches balance from Node API (http://localhost:3001).
    // C. Frontend fetches balance, passes it to backend "Trust me I have X balance".
    //    Backend signs. Node API verifies signature.
    //    Node API also verifies Balance.
    //    If backend signs a tx saying "I have 100", but chain says "I have 50", Node API rejects.
    //    So Option C is safe!

    // FETCH LATEST BALANCE AND NONCE FROM NODE API
    // Instead of trusting the frontend's currentBalance (which might be stale),
    // we fetch it directly from the node right before signing.
    const nodeApiUrl = process.env.NODE_API_URL || "http://localhost:3001";

    let nonce = 0;
    try {
      // Fetch nonce from API
      const nonceResponse = await fetch(
        `${nodeApiUrl}/nonce?address=${wallet.publicKey}`,
      );
      const nonceData = await nonceResponse.json();
      nonce = nonceData.nonce || 0;
      console.log(`Fetched nonce for ${wallet.name}: ${nonce}`);
    } catch (e) {
      console.warn("Failed to fetch nonce from API, using 0:", e.message);
    }

    try {
      const bResponse = await fetch(
        `${nodeApiUrl}/balance?address=${wallet.publicKey}`,
      );
      const bData = await bResponse.json();
      wallet.balance = parseFloat(bData.confirmed || bData.balance || 0);
    } catch (e) {
      console.warn("Failed to fetch latest balance, falling back to body data");
      wallet.balance = parseFloat(req.body.currentBalance || 0);
    }

    const parsedAmount = parseFloat(amount);
    const parsedFee = parseFloat(req.body.fee || 0);

    if (parsedAmount + parsedFee > wallet.balance) {
      throw new Error(
        `Amount + Fee exceeds balance. Balance: ${wallet.balance}, Total Needed: ${parsedAmount + parsedFee}`,
      );
    }

    // Create Transaction using the wallet with fetched nonce
    const transaction = new Transaction({
      senderWallet: wallet,
      recipient,
      amount: parsedAmount,
      fee: parsedFee,
      nonce: nonce, // Use nonce from API
    });

    res.json({ transaction });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// JSON API for Real-time Polling
app.get("/api/live-stats", async (req, res) => {
  try {
    const nodeApiUrl = process.env.NODE_API_URL || "http://localhost:3001";

    // 1. Fetch Node Status (Peers)
    const pResponse = await fetch(`${nodeApiUrl}/net-peers`);
    const pData = await pResponse.json();

    // 2. Fetch Mining Data (Height, Reward, Halving)
    const hResponse = await fetch(`${nodeApiUrl}/height`);
    const hData = await hResponse.json();
    const height = hData.height;
    const cycle = Math.floor(height / HALVING_RATE);
    const reward = Math.max(1, MINING_REWARD / Math.pow(2, cycle));
    const nextHalving = (cycle + 1) * HALVING_RATE - height;

    res.json({
      nodeStatus: { connected: true, peers: pData.connected || 0 },
      miningData: { height, reward, halvingCycle: cycle, nextHalving },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/wallet-balance/:address", async (req, res) => {
  try {
    const nodeApiUrl = process.env.NODE_API_URL || "http://localhost:3001";
    const { address } = req.params;
    const bResponse = await fetch(`${nodeApiUrl}/balance?address=${address}`);
    const bData = await bResponse.json();
    res.json({ balance: bData.balance });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/logs", async (req, res) => {
  try {
    const nodeApiUrl = process.env.NODE_API_URL || "http://localhost:3001";
    const response = await fetch(`${nodeApiUrl}/logs`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Node API error (${response.status}): ${errorText}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Network endpoints - Proxy to main API server
app.get("/net-peers", async (req, res) => {
  try {
    // Forward request to main API server (which has access to P2P server)
    const nodeApiUrl = process.env.NODE_API_URL || "http://localhost:3001";
    const response = await fetch(`${nodeApiUrl}/net-peers`);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({
      error: "Failed to fetch network peers",
      peers: [],
      sockets: [],
      connected: 0,
    });
  }
});

app.post("/net-connect", async (req, res) => {
  try {
    const { peer } = req.body;
    if (!peer) {
      return res.status(400).json({ error: "Peer URL required" });
    }

    // Forward request to main API server
    const nodeApiUrl = process.env.NODE_API_URL || "http://localhost:3001";
    const response = await fetch(`${nodeApiUrl}/net-connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peer }),
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🦐 ShrimpChain GUI running at http://localhost:${PORT}`);
  console.log(`Open your browser to start managing your wallets!`);
});
