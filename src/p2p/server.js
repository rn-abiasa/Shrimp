/* eslint-disable no-console */
import { pipe } from "it-pipe";
import * as lp from "it-length-prefixed";
import map from "it-map";
import { toString as uint8ArrayToString } from "uint8arrays/to-string";
import { fromString as uint8ArrayFromString } from "uint8arrays/from-string";
import { createNode } from "./bundle.js";

const P2P_PORT = process.env.P2P_PORT || 5001;

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
    return this.node.getConnections().map((conn) => conn.remoteAddr.toString());
  }

  setMiner(miner) {
    this.miner = miner;
  }

  async listen() {
    try {
      this.node = await createNode({
        listenAddrs: [`/ip4/0.0.0.0/tcp/${P2P_PORT}`],
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
      pipe(
        // Send our chain as response
        [JSON.stringify(this.blockchain.chain)],
        (source) => map(source, (str) => uint8ArrayFromString(str)),
        lp.encode(),
        stream,
      ).catch((err) => {
        // console.error("Sync stream error:", err);
      });
    });
  }

  setupDiscovery() {
    this.node.addEventListener("peer:discovery", (evt) => {
      // console.log(`Discovered: ${evt.detail.id.toString()}`);
      // Auto-dial handled by connectionManager in bundle.js usually,
      // but explicit dial ensures connection for sync
      this.node.dial(evt.detail.id).catch(() => {});
    });

    this.node.addEventListener("peer:connect", (evt) => {
      const peerId = evt.detail;
      console.log(`✅ Connected to peer: ${peerId.toString()}`);
      this.peers.push(peerId.toString()); // For API

      // On connect, trigger sync to see if they have better chain
      this.requestChain(peerId);
    });

    this.node.addEventListener("peer:disconnect", (evt) => {
      const peerId = evt.detail;
      this.peers = this.peers.filter((p) => p !== peerId.toString());
    });
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
      const stream = await this.node.dialProtocol(peerId, PROTOCOLS.SYNC);
      await pipe(stream, lp.decode(), async (source) => {
        for await (const msg of source) {
          const chainData = uint8ArrayToString(msg.subarray());
          const chain = JSON.parse(chainData);

          console.log(
            `📥 Received chain of length ${chain.length} from ${peerId.toString()}`,
          );
          this.blockchain.replaceChain(chain, true, () => {
            this.transactionPool.clearBlockchainTransactions({
              chain,
            });
            // Broadcast latest block to let others know we synced?
            // Maybe not needed.
          });
        }
      });
    } catch (e) {
      // console.error("Failed to sync from peer:", e.message);
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
      console.error(`Failed to publish to ${topic}:`, e.message);
    }
  }

  // API Compatibility shims
  connect(peer) {
    // Manual connect (expects multiaddr)
    // If user inputs raw IP, we might fail unless we parse it.
    // Assuming user inputs Multiaddr string now.
    try {
      this.node
        .dial(peer)
        .catch((e) => console.error(`Failed to dial ${peer}:`, e.message));
    } catch (e) {
      console.error("Invalid peer address", e.message);
    }
  }

  savePeers() {
    // No-op or save manual peers to config?
  }
}

export default P2pServer;
