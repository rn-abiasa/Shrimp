/* eslint-disable no-console */
import { pipe } from "it-pipe";
import { encode, decode } from "it-length-prefixed";
import map from "it-map";
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

import { concat } from "uint8arrays/concat";

const PROTOCOLS = {
  SYNC: "/shrimp/sync/1.0.0",
  SYNC_STATUS: "/shrimp/sync/status/1.0.0",
  SYNC_BATCH: "/shrimp/sync/batch/1.0.0",
};

const TOPICS = {
  TRANSACTION: "shrimp.transaction",
  BLOCK: "shrimp.block",
};

// Helper: JSON Stream Pipe
async function sendJSON(stream, data) {
  try {
    await pipe(
      [uint8ArrayFromString(JSON.stringify(data))],
      stream.sink || stream,
    );
  } catch (err) {
    console.warn("sendJSON pipe error:", err.message);
  }
}

async function receiveJSON(stream) {
  let result = null;
  try {
    await pipe(stream.source || stream, async (source) => {
      const chunks = [];
      for await (const chunk of source) {
        chunks.push(chunk.subarray ? chunk.subarray() : chunk);
      }
      const str = uint8ArrayToString(concat(chunks));
      if (!str) return;
      try {
        result = JSON.parse(str);
      } catch (e) {
        console.error("JSON Parse Error:", e.message, str.substring(0, 50));
      }
    });
  } catch (err) {
    console.warn("receiveJSON pipe error:", err.message);
  }
  return result;
}

class P2pServer {
  constructor(blockchain, transactionPool) {
    this.blockchain = blockchain;
    this.transactionPool = transactionPool;
    this.node = null;
    this.miner = null;
    this.sockets = []; // For API compatibility (mock)
  }

  // Dynamic getter for connected peers
  get peers() {
    if (!this.node) return [];
    // Return list of connected peer addresses (Multiaddr strings)
    // conn.remoteAddr might be undefined in edge cases?
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
        // Read Raw String (Base64)
        const str = fs.readFileSync(idFile, "utf8").trim().replace(/"/g, ""); // Remove quotes if JSON stringified

        // Validate minimal length to avoid decoding "12D3..." as base64 and crashing later
        if (str.startsWith("12D3")) throw new Error("Legacy format detected");

        const buf = uint8ArrayFromString(str, "base64");
        return await createFromProtobuf(buf);
      } catch (e) {
        console.warn(
          "⚠️  Invalid or legacy Peer ID file. Generating new identity...",
          e.message,
        );
      }
    }

    const id = await createEd25519PeerId();
    // Save Private Key as Base64 Protobuf
    const buf = exportToProtobuf(id);
    const str = uint8ArrayToString(buf, "base64");
    fs.writeFileSync(idFile, str); // Start fresh

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

      // Register Protocols
      this.setupPubSub();
      // this.setupSyncProtocol(); // REMOVED (Legacy Streaming)

      // Register Status Handler (Handshake)
      this.node.handle(PROTOCOLS.SYNC_STATUS, async ({ stream }) => {
        const status = {
          height: this.blockchain.chain.length,
          lastHash:
            this.blockchain.chain[this.blockchain.chain.length - 1].hash,
        };
        await sendJSON(stream, status);
      });

      // Register Batch Handler (Block Download)
      this.node.handle(PROTOCOLS.SYNC_BATCH, async ({ stream }) => {
        try {
          const request = await receiveJSON(stream);
          if (request && typeof request.start === "number") {
            const { start, end } = request;
            const limit = 500; // Hard limit
            const effectiveEnd = Math.min(end, start + limit);

            console.log(`📤 Serving batch: ${start} - ${effectiveEnd}`);
            const blocks = this.blockchain.getChainSlice(start, effectiveEnd);

            // Response: Array of blocks
            await sendJSON(stream, blocks);
          }
        } catch (err) {
          console.error("Batch handle error:", err.message);
        }
      });

      this.setupDiscovery();

      // Start initial sync (ask known peers for chain)
      // Since discovery is async, we rely on 'peer:connect' event
    } catch (e) {
      console.error("Failed to start Libp2p node:", e);
      // Ensure this.node is null on failure so checks work
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

  // Removed setupSyncProtocol()

  setupDiscovery() {
    this.node.addEventListener("peer:discovery", (evt) => {
      const peerId = evt.detail.id;
      this.node.dial(peerId).catch((_err) => {});
    });

    this.node.addEventListener("peer:connect", (evt) => {
      const peerId = evt.detail;
      console.log(`✅ Connected: ${peerId.toString()}`);
      setTimeout(() => this.syncWithPeer(peerId), 2000);
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

  // Removed requestChain()

  // 2. Client Logic: Sync Flow
  async syncWithPeer(peerId) {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      // A. Handshake (Get Status)
      const statusStream = await this.node.dialProtocol(
        peerId,
        PROTOCOLS.SYNC_STATUS,
      );
      const status = await receiveJSON(statusStream);

      if (!status) throw new Error("Failed to get status");
      console.log(
        `� Peer ${peerId.toString().slice(0, 8)} Height: ${status.height}, Local: ${this.blockchain.chain.length}`,
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
      this.requestChain(ma).catch((e) =>
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
