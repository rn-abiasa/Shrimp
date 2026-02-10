import Blockchain from "../src/blockchain/chain.js";
import Miner from "../src/mining/miner.js";
import Wallet from "../src/wallet/index.js";
import TransactionPool from "../src/blockchain/mempool.js";
import P2pServer from "../src/p2p/server.js";

const blockchain = new Blockchain();
const transactionPool = new TransactionPool();
const wallet = new Wallet();
const p2pServer = new P2pServer(blockchain, transactionPool);
const miner = new Miner({ blockchain, transactionPool, wallet, p2pServer });

// Mock P2P server sync
p2pServer.syncChains = () => {
  console.log("Syncing chains...");
};
p2pServer.broadcastTransaction = () => {};

console.log("Starting miner...");
miner.mine();

// Keep process alive to receive worker message
setTimeout(() => {
  console.log("Checking chain...");
  console.log(JSON.stringify(blockchain.chain, null, 2));
  process.exit(0);
}, 5000);
