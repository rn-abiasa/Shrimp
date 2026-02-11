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
    this.node.handle(PROTOCOLS.SYNC, async (args) => {
      console.log("📤 Serving chain sync request (Streaming Blocks)...");
      try {
        let stream = args.stream ? args.stream : args;
        if (!stream.sink && !stream.source && args.stream) {
          stream = args.stream;
        }

        // BLOCK STREAMING LOGIC
        // Instead of sending one huge array, we stream blocks one by one
        const self = this;
        const sourceData = (async function* () {
          for (const block of self.blockchain.chain) {
            yield uint8ArrayFromString(JSON.stringify(block));
          }
        })();

        // Encode manually with raised limit
        let encodedData;
        const MAX_MSG_SIZE = 64 * 1024 * 1024; // 64MB limit (Per Block now, which is huge headroom)

        try {
          // Correct v10 usage: encode(source, options)
          encodedData = encode(sourceData, { maxDataLength: MAX_MSG_SIZE });
        } catch (e) {
          console.warn("Encode with options failed, trying raw:", e.message);
          encodedData = sourceData;
        }

        // BRUTE FORCE WRITE ADAPTER
        console.log("➡️ Writing blocks to stream...");
        if (typeof stream.sink === "function") {
          await stream.sink(encodedData);
        } else if (typeof stream === "function") {
          await stream(encodedData);
        } else {
          // Manual iteration for object streams
          for await (const chunk of encodedData) {
            if (typeof stream.write === "function") {
              stream.write(chunk);
            } else if (typeof stream.push === "function") {
              stream.push(chunk);
            } else if (typeof stream.send === "function") {
              stream.send(chunk);
            } else {
              console.error("❌ Critical: Stream has no known write method.");
              throw new Error("Stream is not writable");
            }
          }
          // End stream if possible
          if (typeof stream.end === "function") stream.end();
        }

        // HACK: Wait for flush.
        await new Promise((r) => setTimeout(r, 1000));

        console.log("✅ Chain sync response (Stream) sent successfully");
      } catch (err) {
        console.error("❌ Sync stream error:", err.message);
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
      console.log(`✅ Connected: ${peerId.toString()}`);
      setTimeout(() => this.requestChain(peerId), 2000);
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
        this.requestChain(fromPeerId);
      }
    }
  }

  async requestChain(peerId) {
    try {
      console.log(`🔄 Requesting chain from ${peerId.toString()}...`);
      const stream = await this.node.dialProtocol(peerId, PROTOCOLS.SYNC);
      if (!stream) throw new Error("Stream is undefined");

      // Universally adaptable read
      const source = stream.source || stream;
      const MAX_MSG_SIZE = 64 * 1024 * 1024; // 64MB limit

      let decodedData;
      // Correct v10 usage: decode(source, options)
      try {
        console.log("🔄 Starting decode stream (Block Mode)...");
        decodedData = decode(source, { maxDataLength: MAX_MSG_SIZE });
      } catch (e) {
        console.warn("Decode with options failed:", e.message);
        decodedData = decode(source); // Fallback
      }

      // Collect blocks
      const receivedChain = [];
      let count = 0;

      for await (const msg of decodedData) {
        const blockData = uint8ArrayToString(msg.subarray());
        try {
          const block = JSON.parse(blockData);
          receivedChain.push(block);
          count++;
          if (count % 100 === 0) process.stdout.write(`.`); // Progress indicator
        } catch (jsonErr) {
          console.error("Failed to parse block JSON:", jsonErr.message);
        }
      }

      console.log(
        `\n📥 Received ${receivedChain.length} blocks from ${peerId.toString()}`,
      );

      if (receivedChain.length > 0) {
        this.blockchain.replaceChain(receivedChain, true, () => {
          this.transactionPool.clearBlockchainTransactions({
            chain: receivedChain,
          });
        });
      }
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
