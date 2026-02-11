import WebSocket, { WebSocketServer } from "ws";
import { getLocalIp } from "../util.js";
import fs from "fs-extra";
import path from "path";
import Block from "../blockchain/block.js";
import Transaction from "../blockchain/transaction.js";
import {
  P2P_VERSION,
  MIN_PEER_VERSION,
  FALLBACK_BOOTSTRAP_PEERS,
} from "../config.js";

import ConfigManager from "../config/manager.js";

const config = ConfigManager.load();
const P2P_PORT = process.env.P2P_PORT || config.P2P_PORT;
const P2P_HOST = process.env.P2P_HOST || config.P2P_HOST;
const PEERS_FILE = path.join(process.cwd(), "peers.json");
// Note: We are migrating PEERS to node-config.json, but keeping peers.json for backward compat / simpler logic for now?
// The plan said: "node-config.json".
// Let's use ConfigManager.load().PEERS as the source of truth if we want to centralize.
// But P2pServer.loadPeers() currently reads peers.json.
// Let's update loadPeers to read from ConfigManager as well or sync them.
// For now, let's keep PEERS in node-config.json as the "SEED" peers (initial static list).

const MESSAGE_TYPES = {
  CHAIN: "CHAIN",
  TRANSACTION: "TRANSACTION",
  CLEAR_TRANSACTIONS: "CLEAR_TRANSACTIONS",
  PEERS: "PEERS",
  MEMPOOL: "MEMPOOL",
  HANDSHAKE: "HANDSHAKE",
};

class P2pServer {
  constructor(blockchain, transactionPool) {
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.sockets = [];
    this.peers = this.loadPeers();
    this.miner = null;
    this.configuredSeedNodes = this.loadConfiguredSeedNodes(); // Track seed nodes from config
  }

  loadConfiguredSeedNodes() {
    // Load seed nodes from node-config.json that should never be removed
    const config = ConfigManager.load();
    return [...(config.PEERS || [])]; // Return copy
  }

  setMiner(miner) {
    this.miner = miner;
  }

  loadPeers() {
    const config = ConfigManager.load();
    const configPeers = config.PEERS || [];

    let savedPeers = [];
    if (fs.existsSync(PEERS_FILE)) {
      try {
        savedPeers = fs.readJsonSync(PEERS_FILE);
      } catch (e) {
        console.error("Failed to load peers.json:", e.message);
      }
    }

    const envPeers = process.env.PEERS
      ? process.env.PEERS.split(",")
          .map((p) => p.trim())
          .filter((p) => p)
      : [];

    // Combine all peer sources
    let allPeers = [...new Set([...configPeers, ...savedPeers, ...envPeers])];

    // Use fallback bootstrap peers if no peers found
    if (allPeers.length === 0) {
      if (FALLBACK_BOOTSTRAP_PEERS && FALLBACK_BOOTSTRAP_PEERS.length > 0) {
        console.log(
          "⚠️  No peers configured. Using fallback bootstrap peers...",
        );
        allPeers = [...FALLBACK_BOOTSTRAP_PEERS];
      } else {
        console.log("⚠️  No peers configured and no fallback peers available.");
      }
    }

    return allPeers;
  }

  savePeers() {
    try {
      fs.writeJsonSync(PEERS_FILE, this.peers);
    } catch (e) {
      console.error("Failed to save peers:", e.message);
    }
  }

  listen() {
    const server = new WebSocketServer({ port: P2P_PORT });
    server.on("connection", (socket) => this.connectSocket(socket));

    this.connectToPeers();

    console.log(`Listening for peer-to-peer connections on: ${P2P_PORT}`);

    // Peer Health Monitoring
    // Remove dead peers from list every 30 seconds
    // BUT: Never remove configured seed nodes from node-config.json
    setInterval(() => {
      const deadPeers = [];
      this.peers.forEach((peer) => {
        const socket = this.sockets.find((s) => s.peerUrl === peer);
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          // Only mark as dead if NOT a configured seed node
          if (!this.configuredSeedNodes.includes(peer)) {
            deadPeers.push(peer);
          }
        }
      });

      if (deadPeers.length > 0) {
        console.log(
          `🧹 Removing ${deadPeers.length} dead peer(s): ${deadPeers.join(", ")}`,
        );
        console.log(
          `✅ Preserving ${this.configuredSeedNodes.length} configured seed node(s)`,
        );
        this.peers = this.peers.filter((p) => !deadPeers.includes(p));
        this.savePeers();
      }
    }, 30000); // Every 30 seconds
  }

  connectToPeers() {
    this.peers.forEach((peer) => {
      this.connect(peer);
    });
  }

  connect(peer) {
    if (this.sockets.find((s) => s.peerUrl === peer)) {
      return; // Already connected
    }

    const socket = new WebSocket(peer);
    socket.peerUrl = peer; // Attach URL for identification

    socket.on("error", (err) => {
      console.log(`❌ Connection failed to ${peer}: ${err.message}`);
      // Retry in 5s
      setTimeout(() => this.connect(peer), 5000);
    });

    socket.on("open", () => this.connectSocket(socket));

    // If it closes, we want to try reconnecting IF it's in our peers list
    socket.on("close", () => {
      // This is handled in connectSocket for 'close' event usually, but we need to trigger reconnect here if it was an established connection that broke.
      // However, 'active' sockets are handled in connectSocket.
      // Let's rely on the error/close handlers set here for the *initial* connection,
      // and if it opens, connectSocket takes over.
    });
  }

  connectSocket(socket) {
    this.sockets.push(socket);
    console.log(
      `🤝 Socket connected (${socket.peerUrl || "incoming connection"})`,
    );
    console.log(`📡 Total active sockets: ${this.sockets.length}`);

    socket.on("message", (message) => this.messageHandler(socket, message));

    socket.on("close", () => {
      console.log("Socket disconnected");
      this.sockets = this.sockets.filter((s) => s !== socket);

      // Auto-reconnect if it was a known peer
      if (socket.peerUrl && this.peers.includes(socket.peerUrl)) {
        console.log(`Reconnecting to ${socket.peerUrl} in 5s...`);
        setTimeout(() => this.connect(socket.peerUrl), 5000);
      }
    });

    socket.on("error", (err) => {
      // Error log handled in connect() or here?
      // If it's an active socket that errors, it will likely 'close' too.
      console.log(`Socket error: ${err.message}`);
      // Trigger close manually or let it close?
      // Usually error is followed by close.
    });

    this.sendHandshake(socket);
  }

  messageHandler(socket, message) {
    try {
      const data = JSON.parse(message);
      switch (data.type) {
        case MESSAGE_TYPES.HANDSHAKE:
          console.log(`📥 Received HANDSHAKE from ${data.p2pUrl || "unknown"}`);
          if (data.version < MIN_PEER_VERSION) {
            console.log(
              `❌ Rejected peer ${data.p2pUrl} with incompatible version ${data.version}. Min required: ${MIN_PEER_VERSION}`,
            );
            socket.close(); // Close connection
            return;
          }

          // Set peerUrl if provided in handshake (helps identify incoming connections)
          if (data.p2pUrl) {
            socket.peerUrl = data.p2pUrl;

            // Discovery: Add newly discovered peer to local list so we can share it with others
            if (!this.peers.includes(data.p2pUrl)) {
              console.log(
                `🌐 New peer discovered from handshake: ${data.p2pUrl}`,
              );
              this.peers.push(data.p2pUrl);
              this.savePeers();
            }
          }

          console.log(
            `Peer version verified: v${data.version} (${socket.peerUrl || "unknown address"})`,
          );
          // Handshake success, now exchange data
          this.sendChain(socket);
          this.sendPeers(socket);
          this.sendMempool(socket);
          break;

        case MESSAGE_TYPES.CHAIN:
          // Reconstruct chain with Block instances from plain objects
          const reconstructedChain = data.chain.map(
            (blockData) => new Block(blockData),
          );

          this.blockchain.replaceChain(reconstructedChain, true, () => {
            this.transactionPool.clearBlockchainTransactions({
              chain: reconstructedChain,
            });
            // Clear transactions that are now invalid due to balance changes
            this.transactionPool.clearInvalidTransactions({
              chain: reconstructedChain,
            });
            // Gossip: Broadcast new valid chain to others
            this.broadcastChain();
          });
          break;

        case MESSAGE_TYPES.TRANSACTION:
          if (
            !this.transactionPool.existingTransaction({
              inputAddress: data.transaction.input.address,
            })
          ) {
            if (Transaction.validTransaction(data.transaction)) {
              this.transactionPool.setTransaction(data.transaction);
              // Gossip: Broadcast new valid transaction
              this.broadcastTransaction(data.transaction);

              // Auto-mine if enabled
              if (this.miner && this.miner.isAutoMining) {
                this.miner.mine();
              }
            } else {
              console.log("Received invalid transaction via P2P");
            }
          }
          break;

        case MESSAGE_TYPES.CLEAR_TRANSACTIONS:
          this.transactionPool.clear();
          break;

        case MESSAGE_TYPES.PEERS:
          data.peers.forEach((peer) => {
            // Only add if not already known
            if (!this.peers.includes(peer)) {
              this.peers.push(peer);
              this.savePeers(); // Persist new peer
              this.connect(peer);
            }
          });
          break;

        case MESSAGE_TYPES.MEMPOOL:
          this.transactionPool.setMap(data.transactionMap);
          break;
      }
    } catch (error) {
      console.log("Error handling message:", error);
    }
  }

  sendChain(socket) {
    socket.send(
      JSON.stringify({
        type: MESSAGE_TYPES.CHAIN,
        chain: this.blockchain.chain,
      }),
    );
  }

  syncChains() {
    this.sockets.forEach((socket) => this.sendChain(socket));
  }

  broadcastChain() {
    this.sockets.forEach((socket) => this.sendChain(socket));
  }

  broadcastTransaction(transaction) {
    this.sockets.forEach((socket) => this.sendTransaction(socket, transaction));
  }

  sendTransaction(socket, transaction) {
    socket.send(
      JSON.stringify({
        type: MESSAGE_TYPES.TRANSACTION,
        transaction,
      }),
    );
  }

  broadcastClearTransactions() {
    this.sockets.forEach((socket) =>
      socket.send(
        JSON.stringify({
          type: MESSAGE_TYPES.CLEAR_TRANSACTIONS,
        }),
      ),
    );
  }

  sendPeers(socket) {
    socket.send(
      JSON.stringify({
        type: MESSAGE_TYPES.PEERS,
        peers: this.peers.concat([`ws://${P2P_HOST}:${P2P_PORT}`]), // Share self + known peers
      }),
    );
  }

  sendMempool(socket) {
    socket.send(
      JSON.stringify({
        type: MESSAGE_TYPES.MEMPOOL,
        transactionMap: this.transactionPool.transactionMap,
      }),
    );
  }

  sendHandshake(socket) {
    const p2pUrl = `ws://${P2P_HOST}:${P2P_PORT}`;
    console.log(`📤 Sending HANDSHAKE to peer identifying as: ${p2pUrl}`);
    socket.send(
      JSON.stringify({
        type: MESSAGE_TYPES.HANDSHAKE,
        version: P2P_VERSION,
        p2pUrl: p2pUrl, // Identify self to peer
      }),
    );
  }
}

export default P2pServer;
