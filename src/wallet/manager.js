import fs from "fs-extra";
import path from "path";
import Wallet from "./index.js";

const WALLETS_DIR =
  process.env.WALLET_DIR || path.join(process.cwd(), "wallets");

class WalletManager {
  constructor() {
    this.ensureWalletsDir();
  }

  ensureWalletsDir() {
    if (!fs.existsSync(WALLETS_DIR)) {
      fs.mkdirSync(WALLETS_DIR);
    }
  }

  list() {
    this.ensureWalletsDir();
    const files = fs.readdirSync(WALLETS_DIR);
    return files
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(".json", ""));
  }

  exists(name) {
    return fs.existsSync(path.join(WALLETS_DIR, `${name}.json`));
  }

  create(name) {
    if (this.exists(name)) {
      throw new Error(`Wallet '${name}' already exists.`);
    }
    const wallet = new Wallet(name);
    wallet.create(); // Generates mnemonic and saves
    return wallet;
  }

  import(name, mnemonic) {
    if (this.exists(name)) {
      throw new Error(`Wallet '${name}' already exists.`);
    }
    const wallet = new Wallet(name);
    wallet.recover(mnemonic);
    wallet.save();
    return wallet;
  }

  get(name) {
    if (!this.exists(name)) {
      throw new Error(`Wallet '${name}' does not exist.`);
    }
    return new Wallet(name);
  }

  delete(name) {
    if (this.exists(name)) {
      fs.unlinkSync(path.join(WALLETS_DIR, `${name}.json`));
    }
  }
}

export default new WalletManager();
