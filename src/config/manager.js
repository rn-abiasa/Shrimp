import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { getLocalIp } from "../util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config file is stored in the project root
const CONFIG_PATH = path.join(process.cwd(), "node-config.json");

const DEFAULT_CONFIG = {
  HTTP_PORT: 3001,
  P2P_PORT: 5001,
  P2P_HOST: getLocalIp() || "localhost",
  PEERS: ["ws://192.168.100.174:5001"], // List of seed peer URLs
};

class ConfigManager {
  static load() {
    try {
      if (!fs.existsSync(CONFIG_PATH)) {
        fs.writeJsonSync(CONFIG_PATH, DEFAULT_CONFIG, { spaces: 2 });
        return DEFAULT_CONFIG;
      }
      const saved = fs.readJsonSync(CONFIG_PATH);

      // Merge with defaults to ensure all keys exist
      const merged = { ...DEFAULT_CONFIG, ...saved };

      // Specifically merge PEERS arrays to ensure default seed nodes are always present
      const defaultPeers = DEFAULT_CONFIG.PEERS || [];
      const savedPeers = saved.PEERS || [];
      merged.PEERS = [...new Set([...defaultPeers, ...savedPeers])];

      return merged;
    } catch (e) {
      console.error("Failed to load config, using defaults:", e);
      return DEFAULT_CONFIG;
    }
  }

  static save(config) {
    try {
      const current = this.load();
      const newConfig = { ...current, ...config };
      fs.writeJsonSync(CONFIG_PATH, newConfig, { spaces: 2 });
      return newConfig;
    } catch (e) {
      console.error("Failed to save config:", e);
      throw e;
    }
  }

  static getPath() {
    return CONFIG_PATH;
  }
}

export default ConfigManager;
