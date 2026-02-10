import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import WalletManager from "../wallet/manager.js";
import Wallet from "../wallet/index.js";
import Transaction from "../blockchain/transaction.js";
import ConfigManager from "../config/manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.GUI_PORT || 3002; // GUI runs on 3002 to avoid conflict with API (3001)

app.use(cors());
app.use(express.json());

// Serve static files (the GUI frontend)
app.use(express.static(__dirname));

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

app.get("/api/wallets/:name/sign", (req, res) => {
  // Normally signing requires POST with data.
  // But for this simplified GUI, we might want the backend to sign transactions?
  // Actually, the CLI logic does: Wallet creates tx -> signs locally -> broadcasts.
  // The GUI frontend can't sign locally because it doesn't have the private key (unless we send it).
  // SECURITY: Sending private keys to frontend is bad practice, but for a local "Desktop App", it's acceptable-ish.
  // BETTER: Frontend sends "create transaction" request to THIS server -> THIS server signs -> Returns signed TX -> Frontend broadcasts to Node.
  res.status(501).json({ error: "Use POST /api/sign-transaction" });
});

app.post("/api/sign-transaction", (req, res) => {
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

    const { currentBalance } = req.body; // Frontend tells us the balance

    // Temporarily set wallet balance to what frontend says,
    // so createTransaction logic (if it checks this.balance) works.
    wallet.balance = currentBalance;

    // We also need 'transactionPool' to check for existing pending txs from this wallet.
    // Frontend should pass existing pending tx object if any?

    // TRUST THE FRONTEND FOR BALANCE (Since we are a light client/GUI)
    // The Node API will reject the transaction if this is wrong/fraudulent anyway.
    wallet.balance = parseFloat(currentBalance);
    const parsedAmount = parseFloat(amount);

    if (parsedAmount > wallet.balance) {
      throw new Error(
        `Amount exceeds balance. Balance: ${wallet.balance}, Amount: ${parsedAmount}`,
      );
    }

    // Create Transaction using the wallet (which now has the correct balance)
    const transaction = new Transaction({
      senderWallet: wallet,
      recipient,
      amount: parsedAmount,
      fee: req.body.fee || 0,
    });

    res.json({ transaction });
  } catch (e) {
    res.status(400).json({ error: e.message });
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
