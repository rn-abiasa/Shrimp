import express from "express";
import ConfigManager from "../../config/manager.js";
import { MINING_REWARD_INPUT } from "../../config.js";

export default function createSystemRoutes({
  blockchain,
  transactionPool,
  wallet,
  p2pServer,
  miner,
  logBuffer,
}) {
  const router = express.Router();

  // GET /logs - System logs
  router.get("/logs", (req, res) => {
    res.json(logBuffer);
  });

  // POST /mine - Mine a block (Manual)
  router.post("/mine", (req, res) => {
    const { minerAddress } = req.body;
    miner.mine(minerAddress);
    res.json({ type: "success", message: "Mining started" });
  });

  // POST /miner/start - Start Auto-Mining
  router.post("/miner/start", (req, res) => {
    miner.start();
    res.json({
      type: "success",
      message: "Auto-Mining started",
      isAutoMining: true,
    });
  });

  // POST /miner/stop - Stop Auto-Mining
  router.post("/miner/stop", (req, res) => {
    miner.stop();
    res.json({
      type: "success",
      message: "Auto-Mining stopped",
      isAutoMining: false,
    });
  });

  // GET /miner/status - Miner Status
  router.get("/miner/status", (req, res) => {
    res.json({
      isAutoMining: miner.isAutoMining,
      minerAddress: miner.minerAddress,
    });
  });

  // POST /set-miner-address - Set Miner Address
  router.post("/set-miner-address", (req, res) => {
    try {
      const { minerAddress } = req.body;
      if (!minerAddress) {
        return res.status(400).json({ error: "minerAddress is required" });
      }

      // Update the miner's default wallet address
      miner.defaultMinerAddress = minerAddress;

      // Optionally persist to config
      const config = ConfigManager.load();
      config.MINER_ADDRESS = minerAddress;
      ConfigManager.save(config);

      res.json({
        message: "Miner address updated successfully",
        minerAddress,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /miner-address - Get Miner Address
  router.get("/miner-address", (req, res) => {
    res.json({
      minerAddress: miner.defaultMinerAddress || wallet.publicKey,
    });
  });

  // GET /net-peers - Connected Peers
  router.get("/net-peers", (req, res) => {
    // Return actual connected Key pairs / Multiaddrs
    const connectedPeers = p2pServer.peers || [];

    res.json({
      peers: connectedPeers,
      connected: connectedPeers.length,
      sockets: connectedPeers, // Map to sockets for GUI compatibility
    });
  });

  // POST /net-connect - Connect to Peer
  router.post("/net-connect", (req, res) => {
    const { peer } = req.body;
    if (!peer) return res.status(400).json({ error: "Peer URL required" });

    // Directly connect. Persistence is handled by P2P logic if needed (bootstrap)
    // p2pServer.peers is a getter, cannot push to it.
    p2pServer.connect(peer);

    // Allow some time for connection
    setTimeout(() => {
      const connectedPeers = p2pServer.peers || [];
      res.json({ message: `Connecting to ${peer}...`, peers: connectedPeers });
    }, 1000);
  });

  return router;
}
