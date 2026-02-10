# 🦐 ShrimpChain

A robust, decentralized, and production-ready blockchain implementation in Node.js.

## ✨ Features

- **Decentralized P2P Network**: Automatic peer discovery and mesh networking via Gossip protocol.
- **Multi-Wallet Support**: Create, import, and manage multiple wallets locally.
- **Secure Transactions**: Local signing ensuring private keys never leave your machine.
- **Mining Rewards**: Mine blocks and receive SHRIMP coins directly to your wallet.
- **Auto-Healing**: Nodes automatically reset and resync if chain data becomes corrupted or incompatible.
- **Persistent Storage**: LevelDB integration for reliable chain storage.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### Installation

```bash
git clone https://github.com/your-username/shrimpchain.git
cd shrimpchain
npm install
```

---

## 🛠️ Deployment Guide

### Option 1: Quick Setup (Recommended)

The CLI includes a setup wizard to generate a startup script for you.

1.  Run the CLI:
    ```bash
    npm run cli
    ```
2.  Select **Setup Node** from the menu.
3.  Answer the prompts:
    - **HTTP Port**: Port for API (e.g., `3001`).
    - **P2P Port**: Port for peering (e.g., `5001`).
    - **Peers**: WebSocket URL of a known node (e.g., `ws://seed-node-ip:5001`). Leave empty if this is the first (Seed) node.
    - **DB Path**: Folder to save blockchain data (e.g., `./db`).
4.  This creates a `start-node.sh` script. Run it:
    ```bash
    ./start-node.sh
    ```

### Option 2: Manual Setup

You can configure the node using environment variables.

**Seed Node (The first node):**

```bash
HTTP_PORT=3001 P2P_PORT=5001 npm run start
```

**Peer Node (Connects to Seed):**

```bash
HTTP_PORT=3002 P2P_PORT=5002 PEERS=ws://localhost:5001 npm run start
```

### Option 3: Local Network (Wi-Fi)

To test with multiple devices on the same Wi-Fi:

1.  **Seed Node (Device A)**:
    - Find your local IP (Mac/Linux: `ipconfig getifaddr en0`, Windows: `ipconfig`).
    - Example IP: `192.168.1.10`
    - Run: `HTTP_PORT=3001 P2P_PORT=5001 P2P_HOST=192.168.1.10 npm run start`

2.  **Peer Node (Device B)**:
    - Connect to Device A's IP.
    - Find your local IP (e.g. `192.168.1.11`).
    - Run: `HTTP_PORT=3001 P2P_PORT=5001 P2P_HOST=192.168.1.11 PEERS=ws://192.168.1.10:5001 npm run start`
    - _Note: Use port 3001/5001 if Device B is a separate machine. If testing on the same machine, use different ports like Option 2._

---

## 💻 Using the CLI

Interact with the blockchain using the built-in CLI tool.

```bash
npm run cli
```

### Main Menu Options

1.  **Wallet Manager**:
    - **Create**: Generate a new wallet. Save your mnemonic!
    - **Import**: Restore a wallet using a mnemonic phrase.
    - **Select**: Choose which wallet to use for transactions.
2.  **View Address**: Show your public key (Address).
3.  **Check Balance**: View your SHRIMP balance.
4.  **Send SHRIMP**: Transfer coins to another address.
5.  **Mine Block**: Mine a new block and earn 50 SHRIMP reward.
6.  **Setup Node**: Generate a startup script for a new node.

---

## 🏗️ Architecture

- **`src/blockchain`**: Core logic (Chain, Block, Transaction, Mempool).
- **`src/p2p`**: Networking layer (WebSocket, Gossip, Sync).
- **`src/api`**: REST API endpoints (Express).
- **`src/wallet`**: Wallet management and cryptography.
- **`src/mining`**: Mining worker logic (Worker Threads).
- **`src/cli`**: Interactive command-line interface.

## 🔒 Security

- **Initial Balance**: Set to 0. Coins are created solely through mining.
- **Consensus**: Invalid blocks or transactions are automatically rejected by honest nodes.
- **Local Keys**: Private keys are stored locally in `wallets/*.json` and never transmitted.

## ⚠️ Troubleshooting

- **"Invalid Genesis Block"**: If a node connects with an incompatible database, it will automatically log an error, clear its database, and resync from scratch.
- **Port in Use**: Ensure no other processes are using the selected ports. Kill zombie processes (e.g. `killall node`) if necessary.

---

## 📜 License

idea by abiasa
