import { parentPort, workerData } from "worker_threads";
import Block from "../blockchain/block.js";

const { lastBlock, data } = workerData;

try {
  const newBlock = Block.mineBlock({ lastBlock, data });
  parentPort.postMessage(newBlock);
} catch (error) {
  console.error("Mining worker error:", error);
  process.exit(1);
}
