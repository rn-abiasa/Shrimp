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
      console.log("📤 Serving chain sync request (NDJSON Mode)...");
      try {
        let stream = args.stream ? args.stream : args;
        if (!stream.sink && !stream.source && args.stream) {
          stream = args.stream;
        }

        // NDJSON STREAMING LOGIC
        // Stream format: JSON_LINE + "\n"
        const self = this;
        let sentCount = 0;
        const totalBlocks = self.blockchain.chain.length;

        const sourceData = (async function* () {
          for (const block of self.blockchain.chain) {
            // Append Newline as delimiter
            const line = JSON.stringify(block) + "\n";
            yield uint8ArrayFromString(line);

            sentCount++;
            if (sentCount % 10 === 0 || sentCount === totalBlocks) {
              console.log(`📤 Streamed ${sentCount}/${totalBlocks} blocks`);
            }
          }
        })();

        console.log(
          `➡️  Starting NDJSON stream write for ${totalBlocks} blocks...`,
        );

        // Write to stream directly (No encode needed for raw text stream)
        if (typeof stream.sink === "function") {
          await stream.sink(sourceData);
        } else if (typeof stream === "function") {
          await stream(sourceData);
        } else {
          for await (const chunk of sourceData) {
            if (typeof stream.write === "function") stream.write(chunk);
            else if (typeof stream.push === "function") stream.push(chunk);
            else if (typeof stream.send === "function") stream.send(chunk);
          }
          if (typeof stream.end === "function") stream.end();
        }

        console.log("✅ Sender finished writing. Waiting for flush...");
        await new Promise((r) => setTimeout(r, 2000));
        console.log("✅ Chain sync response sent successfully");
      } catch (err) {
        if (err.message.includes("reset") || err.message.includes("closed")) {
          console.log("⚠️  Stream closed by peer (Likely transfer complete).");
        } else {
          console.error("❌ Sync stream error:", err.message);
        }
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

      console.log("🔄 Starting NDJSON decode (using pipe)...");

      const receivedChain = [];
      let buffer = "";
      let count = 0;
      let hasReceivedData = false;

      try {
        await pipe(stream.source || stream, async (source) => {
          for await (const chunk of source) {
            if (!hasReceivedData) {
              console.log("⚡ First chunk received! Size:", chunk.length);
              hasReceivedData = true;
            }

            // 1. Append chunk to buffer
            buffer += uint8ArrayToString(
              chunk.subarray ? chunk.subarray() : chunk,
            );

            // 2. Split by newline
            const parts = buffer.split("\n");

            // 3. Process complete parts
            for (let i = 0; i < parts.length - 1; i++) {
              const line = parts[i].trim();
              if (line) {
                try {
                  const block = JSON.parse(line);
                  receivedChain.push(block);
                  count++;
                  if (count % 10 === 0)
                    console.log(`📥 Downloaded ${count} blocks...`);
                } catch (err) {
                  console.error(
                    "Failed to parse block line:",
                    err.message.substring(0, 50),
                  );
                }
              }
            }
            // 4. Keep remainder
            buffer = parts[parts.length - 1];
          }
        });
      } catch (streamErr) {
        if (
          streamErr.message &&
          (streamErr.message.includes("reset") ||
            streamErr.message.includes("closed"))
        ) {
          console.log("⚠️ Stream reset detected (Treating as EOF).");
        } else {
          console.error("Stream pipe error:", streamErr.message);
        }
      }

      // Process leftover provided buffer is not empty
      if (typeof buffer === "string" && buffer.trim()) {
        try {
          const block = JSON.parse(buffer);
          receivedChain.push(block);
        } catch (e) {}
      }

      console.log(
        `\n✅ Stream finished. Total: ${receivedChain.length} blocks.`,
      );

      if (receivedChain.length > 0) {
        console.log(`⛓️ Replacing chain...`);
        this.blockchain.replaceChain(receivedChain, true, () => {
          this.transactionPool.clearBlockchainTransactions({
            chain: receivedChain,
          });
          console.log("✅ Chain replaced successfully!");
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
