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

    let nonce = 0;
    if (chain) {
      const result = Wallet.calculateBalance({
        chain,
        address: this.publicKey,
        transactionPool,
      });
      this.balance = result.balance;
      nonce = result.nonce; // Get current nonce
    }

    if (amount + (fee || 0) > this.balance) {
      throw new Error("Amount + fee exceeds balance");
    }

    return new Transaction({
      senderWallet: this,
      recipient,
      amount,
      fee,
      nonce, // Pass nonce to transaction
    });
  }

  /**
   * Calculate balance (defaults to CONFIRMED balance for safety)
   * For backward compatibility, but now uses confirmed balance only
   * @deprecated Use getConfirmedBalance or getPendingBalance explicitly
   */
  static calculateBalance({ chain, address, transactionPool }) {
    // Use confirmed balance to prevent double spending
    // CRITICAL: Pass transactionPool so nonce includes pending transactions
    return Wallet.getConfirmedBalance({ chain, address, transactionPool });
  }

  /**
   * Get CONFIRMED balance (spendable balance from blockchain only)
   * This is used for transaction validation to prevent double spending
   * IMPORTANT: Nonce calculation MUST include pending mempool transactions
   * @param {Object} params
   * @param {Array} params.chain - The blockchain
   * @param {string} params.address - The address to check
   * @param {Object} params.transactionPool - Optional mempool for nonce calculation
   * @returns {Object} { balance, nonce }
   */
  static getConfirmedBalance({ chain, address, transactionPool }) {
    let balance = INITIAL_BALANCE;
    let nonce = 0;

    // Only calculate from CONFIRMED transactions (in blocks)
    // Do NOT include mempool transactions
    for (let i = 1; i < chain.length; i++) {
      const block = chain[i];
      for (let transaction of block.data) {
        // Skip reward transactions
        if (transaction.input.address === "*authorized-reward*") {
          if (transaction.outputMap[address]) {
            balance += transaction.outputMap[address];
          }
          continue;
        }

        // If we sent this transaction, subtract the input amount
        if (transaction.input.address === address) {
          balance -= transaction.input.amount;
          nonce = Math.max(nonce, (transaction.input.nonce || 0) + 1);
        }

        // If we received funds in this transaction, add the output
        if (transaction.outputMap[address] !== undefined) {
          balance += transaction.outputMap[address];
        }
      }
    }

    // CRITICAL: Calculate next nonce from mempool
    // If there are pending transactions, nonce = highest pending nonce + 1
    if (transactionPool) {
      const pendingTxs = Object.values(transactionPool.transactionMap || {})
        .filter((tx) => tx.input.address === address)
        .sort((a, b) => a.input.nonce - b.input.nonce);

      if (pendingTxs.length > 0) {
        const highestNonce = pendingTxs[pendingTxs.length - 1].input.nonce;
        nonce = highestNonce + 1;
      }
    }

    return { balance, nonce };
  }

  /**
   * Get PENDING balance (confirmed + unconfirmed from mempool)
   * This is for DISPLAY purposes only, not for validation
   * @param {Object} params
   * @param {Array} params.chain - The blockchain
   * @param {string} params.address - The address to check
   * @param {Object} params.transactionPool - The mempool
   * @returns {Object} { balance, nonce }
   */
  static getPendingBalance({ chain, address, transactionPool }) {
    // Start with confirmed balance
    const confirmed = Wallet.getConfirmedBalance({ chain, address });
    let balance = confirmed.balance;
    let nonce = confirmed.nonce;

    // Add pending transactions from mempool
    if (transactionPool && transactionPool.transactionMap) {
      Object.values(transactionPool.transactionMap).forEach((tx) => {
        if (tx.input.address === "*authorized-reward*") {
          if (tx.outputMap[address]) {
            balance += tx.outputMap[address];
          }
          return;
        }

        if (tx.input.address === address) {
          balance -= tx.input.amount;
          nonce = Math.max(nonce, (tx.input.nonce || 0) + 1);
        }

        if (tx.outputMap[address] !== undefined) {
          balance += tx.outputMap[address];
        }
      });
    }

    return { balance, nonce };
  }
}

export default Wallet;
