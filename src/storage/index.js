import { Level } from "level";
import path from "path";
import fs from "fs-extra";
import Block from "../blockchain/block.js";

const DB_PATH = process.env.DB_PATH || "./db";

class Storage {
  constructor() {
    this.db = new Level(DB_PATH, { valueEncoding: "json" });
    this.isOpen = false;
  }

  async open() {
    if (!this.isOpen) {
      await this.db.open();
      this.isOpen = true;
    }
  }

  async saveBlock(block) {
    try {
      await this.open();
      await this.db.put(`block:${block.hash}`, block);
      await this.db.put("latest", block.hash);
    } catch (error) {
      console.error("Failed to save block", error);
    }
  }

  async getBlock(hash) {
    try {
      await this.open();
      return await this.db.get(`block:${hash}`);
    } catch (error) {
      return null;
    }
  }

  async getLatestBlock() {
    try {
      await this.open();
      const hash = await this.db.get("latest");
      return await this.getBlock(hash);
    } catch (error) {
      return null;
    }
  }

  async saveChain(chain) {
    await this.open();
    const ops = chain.map((block) => ({
      type: "put",
      key: `block:${block.hash}`,
      value: block,
    }));
    ops.push({
      type: "put",
      key: "latest",
      value: chain[chain.length - 1].hash,
    });

    try {
      await this.db.batch(ops);
    } catch (error) {
      console.error("Failed to save chain", error);
    }
  }

  // Simple load chain (linked list traversal from latest)
  async loadChain() {
    try {
      await this.open();
      let hash = await this.db.get("latest");
      const chain = [];
      while (hash) {
        const blockData = await this.getBlock(hash);
        if (!blockData) break;

        // Reconstruct as Block instance (not plain object)
        const block = new Block(blockData);
        chain.unshift(block);

        hash = blockData.lastHash;
        if (blockData.lastHash === "-----") break; // Genesis
      }
      return chain.length > 0 ? chain : null;
    } catch (error) {
      console.error("Error loading chain:", error);
      return null;
    }
  }

  async clear() {
    try {
      if (this.isOpen) {
        await this.db.close();
        this.isOpen = false;
      }
      await fs.remove(DB_PATH);
      this.db = new Level(DB_PATH, { valueEncoding: "json" });
      console.log("⚠️  Storage cleared.");
    } catch (error) {
      console.error("Failed to clear storage:", error);
    }
  }
}

export default Storage;
