/* eslint-disable no-console */
import { WebSocketServer, WebSocket } from "ws";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { multiaddr } from "@multiformats/multiaddr";
import {
  createEd25519PeerId,
  createFromProtobuf,
  exportToProtobuf,
} from "@libp2p/peer-id-factory";
import fs from "fs";
import { createNode } from "./bundle.js";

const P2P_PORT = process.env.P2P_PORT || 5001;
// WS_PORT used for explicit Sync Channel
const SYNC_PORT = parseInt(P2P_PORT) + 1; // 5002

const TOPICS = {
  TRANSACTION: "shrimp.transaction",
  BLOCK: "shrimp.block",
};

// Message Types for Sync Protocol
const MSG_TYPE = {
  HANDSHAKE: "HANDSHAKE",
  REQUEST_BATCH: "REQUEST_BATCH",
  RESPONSE_BATCH: "RESPONSE_BATCH",
  NEW_BLOCK: "NEW_BLOCK", // Legacy pubsub fallback
};

class P2pServer {
  constructor(blockchain, transactionPool) {
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.node = null; // Libp2p Node
    this.wss = null; // WebSocket Server for Sync
    this.sockets = new Map(); // PeerID string -> WebSocket
    this.isSyncing = false;
  }

  // --- 1. LIBP2P SECTION (Discovery & Gossip) ---

  async getPeerId() {
    const idFile = `./peer-id-${P2P_PORT}.json`;
    if (fs.existsSync(idFile)) {
      try {
        const str = fs.readFileSync(idFile, "utf8").trim().replace(/"/g, "");
        if (str.startsWith("12D3")) throw new Error("Legacy format detected");
        const buf = uint8ArrayFromString(str, "base64");
        return await createFromProtobuf(buf);
      } catch (e) {
        console.warn("⚠️  Invalid Peer ID file. Replcaing...", e.message);
      }
    }
    const id = await createEd25519PeerId();
    const buf = exportToProtobuf(id);
    const str = uint8ArrayToString(buf, "base64");
    fs.writeFileSync(idFile, str);
    return id;
  }

  async listen() {
    try {
      // A. Start Libp2p (Discovery + Gossip) used on TCP PORT
      const peerId = await this.getPeerId();
      this.node = await createNode({
        peerId,
        listenAddrs: [
          `/ip4/0.0.0.0/tcp/${P2P_PORT}`,
          // Note: We DO NOT bind WS here to avoid port conflict with our Sync Server
        ],
      });

      await this.node.start();
      console.log(`\n📡 Libp2p Node started on TCP/${P2P_PORT}`);
      console.log(`🆔 Peer ID: ${peerId.toString()}`);

      this.setupPubSub();
      this.setupDiscovery();

      // B. Start WebSocket Sync Server (Reliable Data Transfer)
      this.listenSyncServer();

      // C. Start Periodic Sync Check
      this.startPeriodicSync();
    } catch (e) {
      console.error("Failed to start Libp2p node:", e);
      this.node = null;
    }
  }

  setupPubSub() {
    this.node.services.pubsub.subscribe(TOPICS.TRANSACTION);
    this.node.services.pubsub.subscribe(TOPICS.BLOCK);

    this.node.services.pubsub.addEventListener("message", (evt) => {
      const { topic, data } = evt.detail;
      const message = uint8ArrayToString(data);

      try {
        const parsed = JSON.parse(message);
        if (topic === TOPICS.TRANSACTION) {
          this.handleTransaction(parsed);
        } else if (topic === TOPICS.BLOCK) {
          this.handleBlock(parsed, evt.detail.from);
        }
      } catch (e) {
        console.error("Failed to parse pubsub message", e);
      }
    });
  }

  setupDiscovery() {
    this.node.addEventListener("peer:discovery", (evt) => {
      const peerId = evt.detail.id;
      // console.log(`🔎 Discovered peer: ${peerId.toString()}`);

      // Dial Libp2p to establish mesh (for GossipSub)
      this.node.dial(peerId).catch(() => {});
    });

    this.node.addEventListener("peer:connect", (evt) => {
      const peerId = evt.detail;
      const peerIdStr = peerId.toString();
      console.log(`✅ Libp2p Connected: ${peerIdStr}`);

      // TRIGGER HYBRID SYNC:
      setTimeout(() => {
        // Get valid connection to extract remote address
        const connections = this.node.getConnections(peerId);
        if (connections.length === 0) {
          // console.warn("No active connection for sync");
          return;
        }
        const conn = connections[0];
        this.connectToSyncPeer(peerId, conn.remoteAddr);
      }, 2000);
    });

    this.node.addEventListener("peer:disconnect", (evt) => {
      console.log(`❌ Disconnected: ${evt.detail.toString()}`);
    });
  }

  // --- 2. WEBSOCKET SYNC SECTION (Robust Data Transfer) ---

  listenSyncServer() {
    this.wss = new WebSocketServer({ port: SYNC_PORT });
    console.log(`🚀 Sync Server listening on WS/${SYNC_PORT}`);

    this.wss.on("connection", (socket, req) => {
      const ip = req.socket.remoteAddress;
      console.log(`📥 Incoming Sync Connection from ${ip}`);
      this.setupSocketHandler(socket);
    });
  }

  async connectToSyncPeer(peerId, remoteMultiaddr) {
    if (!remoteMultiaddr) return;

    // Parse Multiaddr to find IP and Port
    // Format: /ip4/127.0.0.1/tcp/5001
    const str = remoteMultiaddr.toString();
    const parts = str.split("/");

    let ip = "127.0.0.1";
    let tcpPort = 5001;

    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "ip4" || parts[i] === "ip6") ip = parts[i + 1];
      if (parts[i] === "tcp") tcpPort = parseInt(parts[i + 1], 10);
    }

    // Convention: Sync Port = TCP Port + 1
    const targetSyncPort = tcpPort + 1;

    // Avoid Self-Connection (Loopback check)
    if (targetSyncPort === SYNC_PORT && (ip === "127.0.0.1" || ip === "::1")) {
      console.warn(
        `⚠️ Loopback detected (Target: ${ip}:${targetSyncPort}). Skipping self-sync.`,
      );
      return;
    }

    const targetUrl = `ws://${ip}:${targetSyncPort}`;
    console.log(
      `🔌 Dialing Sync Socket: ${targetUrl} (Peer: ${peerId.toString().slice(0, 8)})`,
    );

    const socket = new WebSocket(targetUrl);

    socket.on("open", () => {
      console.log(
        `✅ Sync Socket Connected to ${peerId.toString().slice(0, 8)}!`,
      );
      this.sockets.set(peerId.toString(), socket);
      this.setupSocketHandler(socket);

      // Trigger Handshake immediately
      this.sendHandshake(socket);
    });

    socket.on("error", (err) => {
      console.warn(`Sync Connection Failed to ${targetUrl}:`, err.message);
    });
  }

  setupSocketHandler(socket) {
    socket.on("message", (message) => {
      try {
        const data = JSON.parse(message);
        switch (data.type) {
          case MSG_TYPE.HANDSHAKE:
            this.handleHandshake(socket, data.payload);
            break;
          case MSG_TYPE.REQUEST_BATCH:
            this.handleRequestBatch(socket, data.payload);
            break;
          case MSG_TYPE.RESPONSE_BATCH:
            this.handleResponseBatch(data.payload);
            break;
          default:
          // console.log("Unknown message type:", data.type);
        }
      } catch (e) {
        console.error("Socket Message Parse Error", e);
      }
    });
  }

  send(socket, type, payload) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, payload }));
    }
  }

  // --- 3. SYNC LOGIC (Header-First / Batch) ---

  sendHandshake(socket) {
    if (socket.readyState !== WebSocket.OPEN) return;
    const payload = {
      height: this.blockchain.chain.length,
      lastHash: this.blockchain.chain[this.blockchain.chain.length - 1].hash,
    };
    this.send(socket, MSG_TYPE.HANDSHAKE, payload);
  }

  handleHandshake(socket, payload) {
    console.log(
      `🤝 Handshake from peer. Height: ${payload.height}, Local: ${this.blockchain.chain.length}`,
    );

    const localHeight = this.blockchain.chain.length;
    if (payload.height > localHeight) {
      console.log(
        `📉 Behind by ${payload.height - localHeight} blocks. Requesting batch...`,
      );
      // Start Batch Sync
      this.requestBatch(socket, localHeight, payload.height); // Sync to target height
    } else if (payload.height < localHeight) {
      // Optional: Notify them they are behind?
      // They should request handshake from us eventually.
    } else {
      // console.log("✅ Chain is up to date.");
    }
  }

  requestBatch(socket, start, end) {
    console.log(`🔄 Requesting Batch: ${start} - ${end}`);
    this.send(socket, MSG_TYPE.REQUEST_BATCH, { start, end });
  }

  handleRequestBatch(socket, { start, end }) {
    //   console.log(`📤 Serving Batch Request: ${start} - ${end}`);
    const limit = 500;
    const effectiveEnd = Math.min(end, start + limit);
    const blocks = this.blockchain.getChainSlice(start, effectiveEnd);
    this.send(socket, MSG_TYPE.RESPONSE_BATCH, blocks);
  }

  handleResponseBatch(blocks) {
    if (!blocks || blocks.length === 0) return;
    console.log(`📦 Received Batch: ${blocks.length} blocks. Processing...`);

    const lastBlock = this.blockchain.chain[this.blockchain.chain.length - 1];
    const firstNew = blocks[0];

    // Basic linking check
    if (
      firstNew.lastHash !== lastBlock.hash &&
      firstNew.index !== lastBlock.index + 1
    ) {
      console.warn(
        `⚠️ Batch mismatch! Local Tip: ${lastBlock.index} (${lastBlock.hash.slice(0, 6)}), Batch Start: ${firstNew.index} (${firstNew.lastHash.slice(0, 6)})`,
      );
      return;
    }

    this.blockchain.replaceChain(
      [...this.blockchain.chain, ...blocks],
      true,
      () => {
        this.transactionPool.clearBlockchainTransactions({ chain: blocks });
        console.log(
          `✅ Chain extended! Height: ${this.blockchain.chain.length}`,
        );

        // Broadcast success via Gossip to let others know we updated?
        // Or simply wait.
      },
    );
  }

  // --- 4. SHARED LOGIC ---

  get peers() {
    return Array.from(this.sockets.keys()); // Return active sync peers
  }

  setMiner(miner) {
    this.miner = miner;
  }

  handleTransaction(transaction) {
    if (
      !this.transactionPool.existingTransaction({
        inputAddress: transaction.input.address,
      })
    ) {
      this.transactionPool.setTransaction(transaction);
    }
  }

  handleBlock(block, fromPeerId) {
    // Gossip Block Handler (Real-time updates)
    const lastBlock = this.blockchain.chain[this.blockchain.chain.length - 1];

    // Case 1: Next valid block
    if (
      block.lastHash === lastBlock.hash &&
      block.index === lastBlock.index + 1
    ) {
      console.log(`📢 Gossip: New block ${block.index} received`);
      this.blockchain.submitBlock(block);
      this.transactionPool.clearBlockchainTransactions({ chain: [block] });

      // Case 2: Future block (Gap detected)
    } else if (block.index > lastBlock.index) {
      console.log(
        `⚠️ Gossip Gap detected. Local: ${lastBlock.index}, Received: ${block.index}. Triggering Sync...`,
      );
      // Trigger Sync with ALL connected sockets
      this.sockets.forEach((socket) => this.sendHandshake(socket));
    }
  }

  startPeriodicSync() {
    // Check every 30 seconds
    setInterval(() => {
      if (this.sockets.size > 0 && !this.isSyncing) {
        //   console.log("⏰ Periodic Sync Check...");
        this.sockets.forEach((socket) => this.sendHandshake(socket));
      }
    }, 30000);
  }

  syncChains() {
    this.broadcastBlock(
      this.blockchain.chain[this.blockchain.chain.length - 1],
    );
  }

  broadcastTransaction(transaction) {
    this.publish(TOPICS.TRANSACTION, transaction);
  }

  broadcastBlock(block) {
    this.publish(TOPICS.BLOCK, block);
  }

  async publish(topic, message) {
    if (!this.node) return;
    try {
      const data = uint8ArrayFromString(JSON.stringify(message));
      await this.node.services.pubsub.publish(topic, data);
    } catch (e) {
      // Ignore no peers
    }
  }

  // API Compatibility shims
  connect(peer) {
    // Manual connect usually supports Multiaddr.
    // But for Hybrid, we might need manual IP dial.
    // We'll trust Libp2p discovery for now.
  }
}

export default P2pServer;
