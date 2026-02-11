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

const PROTOCOLS = {
  SYNC: "/shrimp/sync/1.0.0",
};

const TOPICS = {
  TRANSACTION: "shrimp.transaction",
  BLOCK: "shrimp.block",
};

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

      this.setupPubSub();
      this.setupSyncProtocol();
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

  setupSyncProtocol() {
    // Handle incoming sync requests (Other peers asking for our chain)
    this.node.handle(PROTOCOLS.SYNC, ({ stream }) => {
      console.log("📤 Serving chain sync request...");
      pipe(
        // Send our chain as response
        [JSON.stringify(this.blockchain.chain)],
        (source) => map(source, (str) => uint8ArrayFromString(str)),
        encode, // Pass function reference, NOT call it
        stream,
      ).catch((err) => {
        console.error("❌ Sync stream error:", err.message);
      });
    });
  }

  setupDiscovery() {
    this.node.addEventListener("peer:discovery", (evt) => {
      const peerId = evt.detail.id;
      // console.log(`🔍 Discovered: ${peerId.toString()}`);

      // Auto-dial handled by connectionManager in bundle.js usually,
      // but explicit dial ensures connection for sync
      this.node.dial(peerId).catch((_err) => {
        // Suppress mDNS dial errors
      });
    });

    this.node.addEventListener("peer:connect", (evt) => {
      const peerId = evt.detail;
      console.log(`✅ Connected: ${peerId.toString()}`);
      // On connect, trigger sync to see if they have better chain
      setTimeout(() => this.requestChain(peerId), 1000); // Small delay to let protocol settle
    });

    this.node.addEventListener("peer:disconnect", (evt) => {
      const peerId = evt.detail;
      console.log(`❌ Disconnected: ${peerId.toString()}`);
    });

    // this.node.addEventListener("connection:open", (evt) => { ... });
  }

  // --- Handlers ---

  handleTransaction(transaction) {
    if (
      !this.transactionPool.existingTransaction({
        inputAddress: transaction.input.address,
      })
    ) {
      this.transactionPool.setTransaction(transaction);
      // Re-broadcast? No, GossipSub handles propagation.
    }
  }

  handleBlock(block, fromPeerId) {
    // Check if this block is new
    const lastBlock = this.blockchain.chain[this.blockchain.chain.length - 1];

    if (block.lastHash === lastBlock.hash) {
      // It's the next block!
      console.log(`📦 Received new block ${block.index} from gossip`);
      this.blockchain.submitBlock(block);
      // Note: submitBlock validates it.
      // Also clear pool
      this.transactionPool.clearBlockchainTransactions({ chain: [block] });
    } else if (block.index > lastBlock.index) {
      // We are behind! Request full sync.
      console.log(
        `⚠️  Detected longer chain (tip: ${block.index}). requesting sync...`,
      );
      if (fromPeerId) {
        this.requestChain(fromPeerId);
      }
    }
  }

  // --- Actions ---

  async requestChain(peerId) {
    try {
      console.log(`🔄 Requesting chain from ${peerId.toString()}...`);
      const stream = await this.node.dialProtocol(peerId, PROTOCOLS.SYNC);

      if (!stream) {
        throw new Error("Failed to open sync stream (undefined)");
      }

      await pipe(
        stream,
        decode, // Pass function reference, NOT call it
        async (source) => {
          for await (const msg of source) {
            console.log("📨 Receiving chain data chunk...");
            // msg is Uint8List (buffer)
            const chainData = uint8ArrayToString(msg.subarray());
            try {
              const chain = JSON.parse(chainData);
              console.log(
                `📥 Received chain of length ${chain.length} from ${peerId.toString()}`,
              );
              this.blockchain.replaceChain(chain, true, () => {
                this.transactionPool.clearBlockchainTransactions({
                  chain,
                });
              });
            } catch (jsonErr) {
              console.error("Failed to parse chain JSON:", jsonErr.message);
            }
          }
        },
      );
    } catch (e) {
      console.error("❌ Failed to sync from peer:", e.message);
    }
  }

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
