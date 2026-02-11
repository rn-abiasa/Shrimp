/* eslint-disable no-console */
import { pipe } from "it-pipe";
import { encode, decode } from "it-length-prefixed";
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
const WS_PORT = parseInt(P2P_PORT) + 1; // 5002 by default

const PROTOCOLS = {
  SYNC_STATUS: "/shrimp/sync/status/1.0.0",
  SYNC_BATCH: "/shrimp/sync/batch/1.0.0",
};

const TOPICS = {
  TRANSACTION: "shrimp.transaction",
  BLOCK: "shrimp.block",
};

// Helper: Universal Stream Adapter
async function sendJSON(stream, data) {
  if (!stream) return;

  // Probe stream capabilities once (debug)
  if (!stream._probed) {
    console.log("🔬 Probing Stream Capabilities:");
    console.log(`- has .sink: ${!!stream.sink}`);
    console.log(`- has .source: ${!!stream.source}`);
    console.log(`- has .write: ${typeof stream.write}`);
    console.log(`- has .push: ${typeof stream.push}`);
    console.log(`- has .writable: ${!!stream.writable}`);
    console.log(`- is AsyncIterable: ${typeof stream[Symbol.asyncIterator]}`);
    stream._probed = true;
  }

  const json = JSON.stringify(data);
  const bytes = uint8ArrayFromString(json + "\n"); // NDJSON fallback

  try {
    if (stream.sink) {
      await pipe([bytes], stream.sink);
    } else if (typeof stream.write === "function") {
      stream.write(bytes);
    } else if (stream.writable) {
      // Web Stream Support
      const writer = stream.writable.getWriter();
      await writer.write(bytes);
      writer.releaseLock();
    } else {
      console.error("❌ Stream has no known write method!");
    }
    // console.log("✅ Sent JSON");
  } catch (err) {
    console.warn("sendJSON error:", err.message);
  }
}

async function receiveJSON(stream) {
  if (!stream) return null;
  let source = stream.source || stream;

  // Adapt Web Stream to Iterable if needed
  if (stream.readable && !source[Symbol.asyncIterator]) {
    // Very rough adapter for WebStreams if not directly iterable
    // Assuming handled by it-pipe or native support usually
  }

  try {
    // NDJSON Chunk Reader
    // We manually read from source and parse line-by-line
    // forcing a simpler content model than lp

    // Fallback: If source is not iterable, we can't read
    if (typeof source[Symbol.asyncIterator] !== "function") {
      console.error("❌ Stream source is not async iterable");
      return null;
    }

    const chunks = [];
    for await (const chunk of source) {
      // Collect chunks until newline?
      // For simplicity in this specific "One Request - One Response" protocol:
      // We assume the message comes in one burst or we read until we get a parseable object.
      chunks.push(chunk.subarray ? chunk.subarray() : chunk);

      // Try parsing immediately (NDJSON style)
      const str = uint8ArrayToString(concat(chunks));
      const parts = str.split("\n");
      if (parts.length > 1) {
        // We got at least one full message
        for (const part of parts) {
          if (!part.trim()) continue;
          try {
            return JSON.parse(part);
          } catch (e) {}
        }
      }
    }
  } catch (err) {
    console.warn("receiveJSON error:", err.message);
  }
  return null;
}

class P2pServer {
  constructor(blockchain, transactionPool) {
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.node = null;
    this.miner = null;
    this.sockets = []; // For API compatibility (mock)
    this.isSyncing = false;
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
      const peerId = await this.getPeerId();
      this.node = await createNode({
        peerId,
        listenAddrs: [
          `/ip4/0.0.0.0/tcp/${P2P_PORT}`,
          `/ip4/0.0.0.0/tcp/${WS_PORT}/ws`,
        ],
      });

      await this.node.start();
      console.log(`\n📡 Libp2p Node started!`);
      this.node
        .getMultiaddrs()
        .forEach((ma) => console.log(`   ${ma.toString()}`));

      this.setupPubSub();

      // Register Protocols using Length-Prefixed Streams

      // 1. SYNC STATUS
      this.node.handle(PROTOCOLS.SYNC_STATUS, async (args) => {
        // Handle stream argument direct or distructured
        const stream = args.stream || args;
        console.log("📥 SYNC_STATUS Request Received");

        const status = {
          height: this.blockchain.chain.length,
          lastHash:
            this.blockchain.chain[this.blockchain.chain.length - 1].hash,
        };
        await sendJSON(stream, status);
      });

      // 2. SYNC BATCH
      this.node.handle(PROTOCOLS.SYNC_BATCH, async (args) => {
        const stream = args.stream || args;
        console.log("📥 SYNC_BATCH Request Received");

        const request = await receiveJSON(stream);
        if (request && typeof request.start === "number") {
          const { start, end } = request;
          const limit = 500;
          const effectiveEnd = Math.min(end, start + limit);
          console.log(`📤 Serving batch: ${start} - ${effectiveEnd}`);
          const blocks = this.blockchain.getChainSlice(start, effectiveEnd);
          await sendJSON(stream, blocks);
        }
      });

      this.setupDiscovery();
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
      this.node.dial(peerId).catch((_err) => {});
    });

    this.node.addEventListener("peer:connect", (evt) => {
      const peerId = evt.detail;
      console.log(`✅ Connected to peer: ${peerId.toString()}`);
      setTimeout(() => {
        console.log(`⏰ Triggering sync with ${peerId.toString()}...`);
        this.syncWithPeer(peerId);
      }, 2000);
    });

    this.node.addEventListener("peer:disconnect", (evt) => {
      const peerId = evt.detail;
      console.log(`❌ Disconnected: ${peerId.toString()}`);
    });
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
    const lastBlock = this.blockchain.chain[this.blockchain.chain.length - 1];
    if (block.lastHash === lastBlock.hash) {
      console.log(`📦 Received new block ${block.index} from gossip`);
      this.blockchain.submitBlock(block);
      this.transactionPool.clearBlockchainTransactions({ chain: [block] });
    } else if (block.index > lastBlock.index) {
      console.log(
        `⚠️  Detected longer chain (tip: ${block.index}). requesting sync...`,
      );
      if (fromPeerId) {
        this.syncWithPeer(fromPeerId);
      }
    }
  }

  // 2. Client Logic: Sync Flow
  async syncWithPeer(peerId) {
    console.log(`🔄 syncWithPeer called for ${peerId.toString()}`);
    if (this.isSyncing) {
      console.log("⏳ Already syncing, skipping...");
      return;
    }
    this.isSyncing = true;

    try {
      // A. Handshake (Get Status)
      console.log("✨ Dialing SYNC_STATUS protocol...");
      const statusStream = await this.node.dialProtocol(
        peerId,
        PROTOCOLS.SYNC_STATUS,
      );
      if (!statusStream) {
        console.error("❌ Dial SYNC_STATUS failed: Stream undefined");
        return;
      }
      const status = await receiveJSON(statusStream);

      if (!status) throw new Error("Failed to get status");
      console.log(
        `🔎 Peer ${peerId.toString().slice(0, 8)} Height: ${status.height}, Local: ${this.blockchain.chain.length}`,
      );

      // B. Sync Loop
      let localHeight = this.blockchain.chain.length;
      const receivedChain = [];

      if (status.height > localHeight) {
        console.log(`🚀 Starting Batch Sync... Target: ${status.height}`);

        while (localHeight < status.height) {
          const chunkStart = localHeight;
          const chunkEnd = Math.min(localHeight + 500, status.height);

          console.log(`🔄 Requesting batch ${chunkStart} - ${chunkEnd}...`);

          const batchStream = await this.node.dialProtocol(
            peerId,
            PROTOCOLS.SYNC_BATCH,
          );
          if (!batchStream) {
            console.warn("Dial SYNC_BATCH failed: Stream undefined");
            break;
          }

          // Send Request
          await sendJSON(batchStream, { start: chunkStart, end: chunkEnd });

          // Receive Response
          const blocks = await receiveJSON(batchStream);

          if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
            console.warn(
              `Received empty or invalid batch from ${peerId.toString().slice(0, 8)} for range ${chunkStart}-${chunkEnd}. Aborting sync.`,
            );
            break;
          }

          receivedChain.push(...blocks);
          localHeight += blocks.length;
          console.log(
            `📥 Downloaded ${localHeight} / ${status.height} blocks...`,
          );
        }

        if (receivedChain.length > 0) {
          console.log(
            `\n✅ Sync finished. Total: ${receivedChain.length} new blocks.`,
          );
          console.log(`⛓️ Replacing chain...`);
          this.blockchain.replaceChain(receivedChain, true, () => {
            this.transactionPool.clearBlockchainTransactions({
              chain: receivedChain,
            });
            console.log("✅ Chain replaced successfully!");
          });
        }
      } else {
        console.log("✅ Chain is up to date.");
      }
    } catch (err) {
      console.error("Sync failed:", err.message);
    } finally {
      this.isSyncing = false;
    }
  }

  // Re-implementing a safer SyncOrchestrator below...

  syncChains() {
    // Broadcast our latest block to announce our tip
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
    if (!this.node) {
      // console.warn("Cannot publish: Libp2p node not ready");
      return;
    }
    try {
      const data = uint8ArrayFromString(JSON.stringify(message));
      await this.node.services.pubsub.publish(topic, data);
    } catch (e) {
      if (
        e.message.includes("PublishError.NoPeersSubscribedToTopic") ||
        e.message.includes("no peers subscribed")
      ) {
        console.warn(
          `⚠️  Warning: No peers connected to receive '${topic}'. Data stored locally.`,
        );
      } else {
        console.error(`Failed to publish to ${topic}:`, e.message);
      }
    }
  }

  // API Compatibility shims
  connect(peer) {
    // Manual connect
    try {
      const peerAddr = String(peer).trim();
      const ma = multiaddr(peerAddr);

      console.log(`Doing manual dial to: ${ma.toString()}`);
      // Directly initiate sync which implies connection + protocol negotiation
      this.syncWithPeer(ma).catch((e) =>
        console.error(`Failed to connect/sync with ${peerAddr}:`, e.message),
      );
    } catch (e) {
      console.error("Invalid peer address:", e.message);
    }
  }

  savePeers() {
    // No-op or save manual peers to config?
  }
}

export default P2pServer;
