/* eslint-disable no-console */
import { pipe } from "it-pipe";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { concat } from "uint8arrays/concat";
import { multiaddr } from "@multiformats/multiaddr";
import {
  createEd25519PeerId,
  createFromProtobuf,
  exportToProtobuf,
} from "@libp2p/peer-id-factory";
import fs from "fs";
import { createNode } from "./bundle.js";
import { stringify } from "../utils/json.js";

const P2P_PORT = process.env.P2P_PORT || 5001;
const WS_PORT = parseInt(P2P_PORT) + 1; // 5002

const PROTOCOLS = {
  SYNC: "/shrimp/sync/1.0.0", // Unified Sync Protocol
};

const TOPICS = {
  TRANSACTION: "shrimp.transaction",
  BLOCK: "shrimp.block",
};

// --- DATA TRANSFER HELPERS (Robust Push/Pull) ---

async function sendJSON(stream, data) {
  if (!stream) return;
  const json = stringify(data);
  const bytes = uint8ArrayFromString(json + "\n"); // NDJSON delimiter

  try {
    // KNOWLEDGE DISCOVERY RESULT:
    // YamuxStream (v8.0.1) extends AbstractMessageStream.
    // It has a .send(Uint8Array) method!
    // It does NOT have .sink or .source properties in the modern it-stream-types sense
    // but implements AsyncIterable (for reading) directly.

    if (typeof stream.send === "function") {
      stream.send(bytes);
      return;
    }

    // Fallback if it's a different stream type (e.g. mock)
    if (stream.sink) {
      await pipe([bytes], stream.sink);
      return;
    }

    console.warn("sendJSON: Stream has no known write method (send/sink)");
  } catch (err) {
    console.warn("sendJSON error:", err.message);
  }
}

async function receiveJSON(stream) {
  if (!stream) return null;
  // YamuxStream IS the source (AsyncIterable)
  const source = stream;

  try {
    if (typeof source[Symbol.asyncIterator] !== "function") {
      // Maybe it has .source property?
      if (
        stream.source &&
        typeof stream.source[Symbol.asyncIterator] === "function"
      ) {
        return await readFromSource(stream.source);
      }
      return null;
    }
    return await readFromSource(source);
  } catch (err) {
    console.warn("receiveJSON error:", err.message);
    return null;
  }
}

async function readFromSource(source) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("receiveJSON timeout")), 10000),
  );

  const reader = async () => {
    const chunks = [];
    for await (const chunk of source) {
      chunks.push(chunk.subarray ? chunk.subarray() : chunk);

      const str = uint8ArrayToString(concat(chunks));
      const parts = str.split("\n");

      for (const part of parts) {
        if (!part.trim()) continue;
        try {
          return JSON.parse(part);
        } catch (e) {}
      }
    }
  };

  return await Promise.race([reader(), timeout]);
}

class P2pServer {
  constructor(blockchain, transactionPool) {
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.node = null;
    this.miner = null;
    this.isSyncing = false;
  }

  // --- 1. CORE LIBP2P SETUP ---

  async getPeerId() {
    const idFile = `./peer-id-${P2P_PORT}.json`;
    if (fs.existsSync(idFile)) {
      try {
        const str = fs.readFileSync(idFile, "utf8").trim().replace(/"/g, "");
        if (str.startsWith("12D3")) throw new Error("Legacy format detected");
        const buf = uint8ArrayFromString(str, "base64");
        return await createFromProtobuf(buf);
      } catch (e) {
        console.warn("Creating new PeerID...", e.message);
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
      const peerId = await this.getPeerId();
      this.node = await createNode({
        peerId,
        listenAddrs: [
          `/ip4/0.0.0.0/tcp/${P2P_PORT}`,
          `/ip4/0.0.0.0/tcp/${WS_PORT}/ws`,
        ],
      });

      await this.node.start();
      console.log(`\n📡 Libp2p Node started on TCP/${P2P_PORT}`);
      console.log(`🆔 Peer ID: ${peerId.toString()}`);

      this.setupPubSub();
      this.setupSyncProtocol();
      this.setupDiscovery();
    } catch (e) {
      console.error("Failed to start Libp2p node:", e);
      this.node = null;
    }
  }

  // --- 2. SYNC PROTOCOL (Longest Chain Rule) ---

  setupSyncProtocol() {
    // Handle incoming sync requests
    this.node.handle(PROTOCOLS.SYNC, async (args) => {
      const stream = args.stream || args;
      // console.log("📥 Received SYNC request");

      // 1. Receive their status/chain
      const request = await receiveJSON(stream);
      if (!request) return;

      if (request.type === "REQUEST_CHAIN") {
        // They want our chain
        //   console.log("📤 Sending Chain...");
        await sendJSON(stream, {
          type: "CHAIN_DATA",
          chain: this.blockchain.chain,
        });
      } else if (request.type === "CHAIN_DATA") {
        // They sent us their chain (Push update?)
        this.handleIncomingChain(request.chain);
      }
    });
  }

  async syncWithPeer(peerId) {
    if (this.isSyncing) return;
    this.isSyncing = true;
    console.log(`🔄 Syncing with ${peerId.toString().slice(0, 8)}...`);

    try {
      const stream = await this.node.dialProtocol(peerId, PROTOCOLS.SYNC);
      if (!stream) throw new Error("Stream failed");

      // 1. Request Chain
      await sendJSON(stream, { type: "REQUEST_CHAIN" });

      // 2. Receive Chain
      const response = await receiveJSON(stream);
      if (
        response &&
        response.type === "CHAIN_DATA" &&
        Array.isArray(response.chain)
      ) {
        this.handleIncomingChain(response.chain);
      }
    } catch (err) {
      console.error("Sync Error:", err.message);
    } finally {
      this.isSyncing = false;
    }
  }

  handleIncomingChain(incomingChain) {
    const currentLength = this.blockchain.chain.length;
    const incomingLength = incomingChain.length;

    if (incomingLength > currentLength) {
      console.log(
        `📦 Received longer chain (${incomingLength}). Replacing local (${currentLength})...`,
      );

      this.blockchain.replaceChain(incomingChain, true, () => {
        this.transactionPool.clearBlockchainTransactions({
          chain: incomingChain,
        });
        console.log("✅ Chain replaced successfully!");
      });
    } else {
      //   console.log("✅ Local chain is up to date.");
    }
  }

  // --- 3. DISCOVERY & EVENTS ---

  setupDiscovery() {
    this.node.addEventListener("peer:discovery", (evt) => {
      const peerId = evt.detail.id;
      this.node.dial(peerId).catch(() => {});
    });

    this.node.addEventListener("peer:connect", (evt) => {
      const peerId = evt.detail;
      console.log(`✅ Connected: ${peerId.toString().slice(0, 8)}`);

      // Trigger Sync on Connect
      setTimeout(() => this.syncWithPeer(peerId), 2000);
    });
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

  // --- 4. DATA HANDLERS ---

  handleTransaction(transactionData) {
    try {
      // Rehydrate transaction to restore BigInts
      const transaction = Transaction.fromJSON(transactionData);

      if (
        !this.transactionPool.existingTransaction({
          inputAddress: transaction.input.address,
        })
      ) {
        this.transactionPool.setTransaction(transaction);
      }
    } catch (error) {
      console.error("Invalid transaction received via P2P:", error.message);
    }
  }

  handleBlock(blockData, fromPeerId) {
    try {
      // Rehydrate block transactions
      const block = {
        ...blockData,
        data: blockData.data.map((tx) => Transaction.fromJSON(tx)),
      };

      const lastBlock = this.blockchain.chain[this.blockchain.chain.length - 1];

      // Normal Append
      if (
        block.lastHash === lastBlock.hash &&
        block.index === lastBlock.index + 1
      ) {
        console.log(`📢 New Block ${block.index} received`);
        this.blockchain.submitBlock(block);
        this.transactionPool.clearBlockchainTransactions({ chain: [block] });
      }
      // Gap Detected -> Trigger Sync
      else if (block.index > lastBlock.index) {
        console.log(`⚠️ Block Gap (Tip: ${block.index}). Triggering Sync...`);
        if (fromPeerId) this.syncWithPeer(fromPeerId);
      }
    } catch (error) {
      console.error("Invalid block received via P2P:", error.message);
    }
  }

  // --- 5. UTILS ---

  syncChains() {
    const lastBlock = this.blockchain.chain[this.blockchain.chain.length - 1];
    this.broadcastBlock(lastBlock);
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
      const data = uint8ArrayFromString(stringify(message));
      await this.node.services.pubsub.publish(topic, data);
    } catch (e) {
      // Ignore
    }
  }

  connect(peer) {
    // Manual connect
    try {
      const peerAddr = String(peer).trim();
      const ma = multiaddr(peerAddr);
      console.log(`Doing manual dial to: ${ma.toString()}`);
      this.syncWithPeer(ma).catch((e) =>
        console.error("Manual Dial Failed:", e.message),
      );
    } catch (e) {
      console.error("Invalid peer address:", e.message);
    }
  }

  get peers() {
    if (!this.node) return [];
    return this.node
      .getConnections()
      .map((conn) => conn.remoteAddr?.toString() || "unknown");
  }

  setMiner(miner) {
    this.miner = miner;
  }
}

export default P2pServer;
