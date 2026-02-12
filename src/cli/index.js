import {
  intro,
  outro,
  select,
  text,
  spinner,
  isCancel,
  cancel,
} from "@clack/prompts";
import color from "picocolors";
import fetch from "node-fetch";
import WebSocket from "ws";
import WalletManager from "../wallet/manager.js";
import Transaction from "../blockchain/transaction.js";
import { getLocalIp, copyToClipboard } from "../util.js";
import { toBaseUnits } from "../config.js";
import { stringify } from "../utils/json.js";

const HTTP_PORT = process.env.HTTP_PORT || 3001;
const P2P_PORT = process.env.P2P_PORT || 5001;
let BASE_URL = `http://localhost:${HTTP_PORT}`;
let currentWallet = null;
const pendingTransactions = new Set();
let ws = null;

function initP2P() {
  ws = new WebSocket(`ws://localhost:${P2P_PORT}`);

  ws.on("open", () => {
    // console.log(color.dim("Connected to P2P network for realtime updates"));
  });

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data);
      if (message.type === "CHAIN") {
        const chain = message.chain;
        const latestBlock = chain[chain.length - 1];

        latestBlock.data.forEach((tx) => {
          if (pendingTransactions.has(tx.id)) {
            console.log(
              color.green(
                `\n✅ Transaction ${tx.id.substring(0, 8)}... Confirmed in Block ${latestBlock.index}!`,
              ),
            );
            pendingTransactions.delete(tx.id);
            process.stdout.write("> "); // Restore prompt hint if needed
          }
        });
      }
    } catch (e) {}
  });

  ws.on("error", () => {
    // Silent fail, retry not strictly needed for CLI v1 but good to have
  });
}

// Helper to ensure wallet is selected
async function ensureWallet() {
  if (currentWallet) return true;

  const wallets = WalletManager.list();
  if (wallets.length === 0) {
    console.log(
      color.yellow("⚠️ No wallets found. Please create or import one first."),
    );
    return false;
  }

  const selected = await select({
    message: "Select a wallet to use:",
    options: wallets.map((w) => ({ value: w, label: w })),
  });

  if (isCancel(selected)) return false;

  try {
    currentWallet = WalletManager.get(selected);
    console.log(color.green(`\n🔑 Active Wallet: ${color.bold(selected)}`));
    return true;
  } catch (e) {
    console.error(color.red(`Failed to load wallet: ${e.message}`));
    return false;
  }
}

async function main() {
  console.clear();
  initP2P();
  intro(color.bgCyan(color.black(" 🦐 ShrimpChain CLI ")));

  const s = spinner();

  let autoMiningStatus = false;

  // Fetch initial status
  try {
    const res = await fetch(`${BASE_URL}/miner/status`);
    const data = await res.json();
    autoMiningStatus = data.isAutoMining;
  } catch (e) {}

  while (true) {
    const action = await select({
      message: "What would you like to do?",
      options: [
        {
          value: "switch_node",
          label: "Switch Node",
          hint: `Current: ${BASE_URL}`,
        },
        {
          value: "automining",
          label: `Auto Mining: ${autoMiningStatus ? "ON 🟢" : "OFF 🔴"}`,
          hint: "Toggle auto-mining on transaction receipt",
        },
        {
          value: "wallet",
          label: "Wallet Manager",
          hint: "Create, Import, List, Select Wallets",
        },
        {
          value: "address",
          label: "View Address",
          hint: "Show your public key",
        },
        {
          value: "balance",
          label: "Check Balance",
          hint: "View current balance",
        },
        {
          value: "send",
          label: "Send SHRIMP",
          hint: "Transfer to another wallet",
        },
        { value: "mine", label: "Mine Block", hint: "Earn rewards by mining" },
        { value: "peers", label: "List Peers", hint: "View connected nodes" },
        { value: "setup", label: "Setup Node", hint: "Configure a new node" },
        { value: "exit", label: "Exit", hint: "Close the CLI" },
      ],
    });

    if (isCancel(action) || action === "exit") {
      outro("👋 Goodbye!");
      process.exit(0);
    }

    // Header Info
    if (currentWallet) {
      console.log(color.dim(`Active Wallet: ${currentWallet.name}`));
    } else {
      console.log(color.dim(`No Wallet Selected`));
    }

    if (action === "switch_node") {
      const newUrl = await text({
        message: "Enter Node API URL:",
        placeholder: "http://localhost:3002",
        defaultValue: BASE_URL,
      });
      if (!isCancel(newUrl)) {
        BASE_URL = newUrl.replace(/\/$/, ""); // Remove trailing slash
        console.log(color.green(`\n✅ Switched to Node: ${BASE_URL}`));
      }
      continue;
    }

    if (action === "automining") {
      const endpoint = autoMiningStatus ? "/miner/stop" : "/miner/start";
      try {
        const res = await fetch(`${BASE_URL}${endpoint}`, { method: "POST" });
        const data = await res.json();
        autoMiningStatus = data.isAutoMining;
        console.log(color.green(`\n${data.message}`));
      } catch (e) {
        console.error(color.red(`Failed to toggle mining: ${e.message}`));
      }
      continue;
    }

    if (action === "wallet") {
      const walletAction = await select({
        message: "Wallet Manager",
        options: [
          {
            value: "create",
            label: "Create New Wallet",
            hint: "Generate new keys",
          },
          {
            value: "import",
            label: "Import Wallet",
            hint: "Restore from mnemonic",
          },
          {
            value: "list",
            label: "List Wallets",
            hint: "Show all saved wallets",
          },
          {
            value: "copy",
            label: "Copy Wallet Address",
            hint: "Copy address to clipboard",
          },
          {
            value: "select",
            label: "Select Active Wallet",
            hint: "Switch wallet",
          },
          { value: "back", label: "Back", hint: "Return to main menu" },
        ],
      });

      if (isCancel(walletAction) || walletAction === "back") continue;

      if (walletAction === "create") {
        const name = await text({ message: "Enter wallet name:" });
        if (isCancel(name) || !name) continue;
        try {
          const wallet = WalletManager.create(name);
          console.log(color.green("\n✅ Wallet Created!"));
          console.log(color.yellow("Mnemonic (SAVE THIS): ") + wallet.mnemonic);
          currentWallet = wallet;
        } catch (e) {
          console.error(color.red(e.message));
        }
      } else if (walletAction === "import") {
        const name = await text({ message: "Enter wallet name:" });
        if (isCancel(name) || !name) continue;
        const mnemonic = await text({ message: "Enter mnemonic phrase:" });
        if (isCancel(mnemonic) || !mnemonic) continue;

        try {
          const wallet = WalletManager.import(name, mnemonic);
          console.log(color.green("\n✅ Wallet Imported!"));
          currentWallet = wallet;
        } catch (e) {
          console.error(color.red(e.message));
        }
      } else if (walletAction === "list") {
        const wallets = WalletManager.list();
        console.log(color.cyan("\n📂 Saved Wallets:"));
        wallets.forEach((w) => console.log(` - ${w}`));
        console.log("");
      } else if (walletAction === "copy") {
        const wallets = WalletManager.list();
        if (wallets.length === 0) {
          console.log(color.yellow("No wallets found."));
          continue;
        }
        const selected = await select({
          message: "Select wallet to copy address:",
          options: wallets.map((w) => ({ value: w, label: w })),
        });
        if (isCancel(selected)) continue;
        try {
          const w = WalletManager.get(selected);
          await copyToClipboard(w.publicKey);
          console.log(
            color.green(`\n✅ Copied address for '${selected}' to clipboard!`),
          );
          console.log(color.dim(w.publicKey));
        } catch (e) {
          console.error(color.red(`Failed to copy: ${e.message}`));
        }
      } else if (walletAction === "select") {
        currentWallet = null; // force selection
        await ensureWallet();
      }
      continue; // Loop back to main menu
    }

    // Require wallet for these actions
    if (["address", "balance", "send"].includes(action)) {
      if (!(await ensureWallet())) continue;
    }

    if (action === "init") {
      // Deprecated by Wallet Manager, but keeping for backward compat if needed,
      // or removing entirely. Let's redirect to create.
      console.log(color.yellow("Use 'Wallet Manager' -> 'Create' instead."));
    } else if (action === "address") {
      const pubKey = currentWallet.publicKey;
      console.log(color.cyan("\n📍 Wallet Address: ") + pubKey);
      try {
        await copyToClipboard(pubKey);
        console.log(color.green("✅ Copied to clipboard!"));
      } catch (e) {
        console.log(color.dim("(Failed to copy to clipboard)"));
      }
      console.log("");
    } else if (action === "balance") {
      s.start("Fetching balance from blockchain...");
      try {
        const response = await fetch(
          `${BASE_URL}/balance?address=${currentWallet.publicKey}`,
        );
        const data = await response.json();
        s.stop(`💰 Balance: ${data.balance} SHRIMP`);
        const shortAddr = `${data.address.substring(0, 20)}...${data.address.substring(data.address.length - 10)}`;
        console.log(color.dim(`Address: ${shortAddr}\n`));
      } catch (error) {
        s.stop("Failed to fetch balance ❌");
        console.error(color.red(error.message));
      }
    } else if (action === "send") {
      try {
        const recipient = await text({
          message: "Recipient address:",
          placeholder: "Enter wallet address",
          validate(value) {
            if (!value) return "Address is required";
            if (value.length < 10) return "Invalid address";
          },
        });

        if (isCancel(recipient)) continue;

        const amount = await text({
          message: "Amount to send:",
          placeholder: "Enter amount in SHRIMP",
          validate(value) {
            if (!value || isNaN(value)) return "Amount must be a number";
            if (parseFloat(value) <= 0) return "Amount must be greater than 0";
          },
        });

        if (isCancel(amount)) continue;

        s.start("Creating transaction...");

        // 1. Fetch current balance & nonce from API
        // API now returns projected (pending) balance by default
        const balanceRes = await fetch(
          `${BASE_URL}/balance?address=${currentWallet.publicKey}`,
        );
        const balanceData = await balanceRes.json();

        // CRITICAL: Sync local wallet balance with API projected balance BEFORE signing
        currentWallet.balance = toBaseUnits(balanceData.balance);

        const amountBI = toBaseUnits(amount);
        const feeBI = toBaseUnits(0.000001); // Default fee for CLI

        // 2. Create and sign transaction locally
        // Using the projected balance and nonce fetched from the API
        const transaction = new Transaction({
          senderWallet: currentWallet,
          recipient,
          amount: amountBI,
          fee: feeBI,
          nonce: balanceData.nonce,
        });

        // 3. Broadcast signed transaction
        const response = await fetch(`${BASE_URL}/transact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: stringify({
            transaction,
          }),
        });

        const data = await response.json();

        if (data.type === "error") {
          s.stop("Transaction failed ❌");
          console.error(color.red(data.message + "\n"));
        } else {
          s.stop("Transaction created! ✅");
          pendingTransactions.add(transaction.id);
          console.log(
            color.green(
              `Sent ${amount} SHRIMP to ${recipient.substring(0, 20)}...`,
            ),
          );
          console.log(
            color.dim(
              "Transaction added to mempool. Mining started automatically...\n",
            ),
          );
        }
      } catch (error) {
        s.stop("Transaction failed ❌");
        console.error(color.red(error.message));
      }
    } else if (action === "mine") {
      s.start("Mining block...");
      try {
        // Ensure wallet is selected to receive reward
        if (!currentWallet) {
          const proceed = await select({
            message:
              "No wallet selected! Mining reward will go to the server node. Proceed?",
            options: [
              { value: "yes", label: "Yes, mine for the node" },
              { value: "no", label: "No, select a wallet first" },
            ],
          });
          if (proceed === "no") {
            await ensureWallet();
          }
        }

        const minerAddress = currentWallet ? currentWallet.publicKey : null;

        await fetch(`${BASE_URL}/mine`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: stringify({ minerAddress }),
        });
        s.stop("Block Mined Successfully! ⛏️");
      } catch (error) {
        s.stop("Mining failed ❌");
        console.error(color.red(error.message));
      }
    } else if (action === "peers") {
      s.start("Fetching peers...");
      await new Promise((r) => setTimeout(r, 400));
      s.stop(
        "Peers: Note: This CLI does not connect directly to P2P. Check node logs.",
      );
    } else if (action === "setup") {
      const httpPort = await text({
        message: "Enter HTTP Port for API:",
        placeholder: "3001",
        defaultValue: "3001",
      });
      if (isCancel(httpPort)) continue;

      const p2pPort = await text({
        message: "Enter P2P Port for Gossip:",
        placeholder: "5001",
        defaultValue: "5001",
      });
      if (isCancel(p2pPort)) continue;

      const defaultIp = getLocalIp();
      const p2pHost = await text({
        message: "Enter your LAN IP (for other nodes to connect):",
        placeholder: defaultIp,
        defaultValue: defaultIp,
      });
      if (isCancel(p2pHost)) continue;

      const peers = await text({
        message: "Enter Peer Websocket URLs (comma separated):",
        placeholder: "ws://localhost:5001",
        defaultValue: "",
      });
      if (isCancel(peers)) continue;

      const dbPath = await text({
        message: "Enter DB Path:",
        placeholder: "./db",
        defaultValue: "./db",
      });
      if (isCancel(dbPath)) continue;

      import("fs").then((fs) => {
        const scriptContent = `#!/bin/bash\nHTTP_PORT=${httpPort} P2P_PORT=${p2pPort} P2P_HOST=${p2pHost} PEERS=${peers} DB_PATH=${dbPath} npm run dev`;
        fs.writeFileSync("start-node.sh", scriptContent);
        fs.chmodSync("start-node.sh", "755");
        console.log(color.green("\n✅ 'start-node.sh' created!"));
        console.log(color.cyan("Run it with: ./start-node.sh\n"));
      });
    }
  }
}

main().catch(console.error);
