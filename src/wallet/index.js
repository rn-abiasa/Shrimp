import { INITIAL_BALANCE } from "../config.js";
import { genKeyPair, cryptoHash } from "../crypto/index.js";
import Transaction from "../blockchain/transaction.js";
import * as bip39 from "bip39";
import fs from "fs-extra";
import path from "path";

const WALLETS_DIR = path.join(process.cwd(), "wallets");

// Ensure wallets dir exists
if (!fs.existsSync(WALLETS_DIR)) {
  fs.mkdirSync(WALLETS_DIR);
}

class Wallet {
  constructor(name = "default") {
    this.name = name;
    this.balance = INITIAL_BALANCE;
    this.keyPair = null;
    this.publicKey = null;
    this.address = null;
    this.mnemonic = null;

    this.load();
  }

  getWalletPath() {
    return path.join(WALLETS_DIR, `${this.name}.json`);
  }

  save() {
    try {
      const walletPath = this.getWalletPath();
      fs.writeJsonSync(walletPath, { mnemonic: this.mnemonic });
    } catch (error) {
      console.error("Failed to save wallet", error);
    }
  }

  load() {
    try {
      const walletPath = this.getWalletPath();
      if (fs.existsSync(walletPath)) {
        const data = fs.readJsonSync(walletPath);
        if (data.mnemonic) {
          this.recover(data.mnemonic);
        }
      }
    } catch (error) {
      console.error("Failed to load wallet", error);
    }
  }

  create() {
    this.mnemonic = bip39.generateMnemonic();
    this.recover(this.mnemonic);
    this.save();
    return this.mnemonic;
  }

  recover(mnemonic) {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic");
    }
    this.mnemonic = mnemonic;
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const privateKey = cryptoHash(seed.toString("hex"));
    this.keyPair = genKeyPair().ec.keyFromPrivate(privateKey);
    this.publicKey = this.keyPair.getPublic("hex");
    this.address = cryptoHash(this.publicKey);
    this.balance = INITIAL_BALANCE; // Reset balance on recovery? No, ideally we should sync. But for now local.
  }

  sign(data) {
    if (!this.keyPair) {
      this.load();
    }
    return this.keyPair.sign(cryptoHash(data));
  }

  createTransaction({ recipient, amount, fee, chain, transactionPool }) {
    if (!this.keyPair) {
      this.load();
    }

    if (!this.keyPair) {
      throw new Error("Wallet not found. Run the CLI to initialize a wallet.");
    }
    if (chain) {
      this.balance = Wallet.calculateBalance({
        chain,
        address: this.publicKey,
        transactionPool, // Add transactionPool
      });
    }

    if (amount + (fee || 0) > this.balance) {
      throw new Error("Amount + fee exceeds balance");
    }

    return new Transaction({ senderWallet: this, recipient, amount, fee });
  }

  static calculateBalance({ chain, address, transactionPool }) {
    let balance = INITIAL_BALANCE;

    // Calculate balance from entire chain
    // Use additive/subtractive approach to avoid early break issues
    for (let i = 1; i < chain.length; i++) {
      const block = chain[i];
      for (let transaction of block.data) {
        // Skip reward transactions
        if (transaction.input.address === "*authorized-reward*") {
          // Check if we received mining reward
          if (transaction.outputMap[address]) {
            balance += transaction.outputMap[address];
          }
          continue;
        }

        // If we sent this transaction, subtract the input amount
        if (transaction.input.address === address) {
          balance -= transaction.input.amount;
        }

        // If we received funds in this transaction, add the output
        if (transaction.outputMap[address]) {
          balance += transaction.outputMap[address];
        }
      }
    }

    // Account for pending transactions in mempool
    if (transactionPool && transactionPool.transactionMap) {
      Object.values(transactionPool.transactionMap).forEach((tx) => {
        // Skip reward transactions
        if (tx.input.address === "*authorized-reward*") {
          if (tx.outputMap[address]) {
            balance += tx.outputMap[address];
          }
          return;
        }

        // If we sent this pending transaction
        if (tx.input.address === address) {
          balance -= tx.input.amount;
          // Add back our change
          if (tx.outputMap[address]) {
            balance += tx.outputMap[address];
          }
        } else if (tx.outputMap[address]) {
          // If we're receiving in this pending transaction
          balance += tx.outputMap[address];
        }
      });
    }

    return balance;
  }
}

export default Wallet;
