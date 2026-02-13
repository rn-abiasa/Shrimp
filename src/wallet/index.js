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
    return this.keyPair.sign(cryptoHash(data)).toDER("hex");
  }

  createTransaction({
    recipient,
    amount,
    fee,
    chain,
    transactionPool,
    type,
    data,
  }) {
    if (!this.keyPair) {
      this.load();
    }

    if (!this.keyPair) {
      throw new Error("Wallet not found. Run the CLI to initialize a wallet.");
    }

    let nonce = 0;
    let pendingBalance = this.balance;

    if (chain) {
      // ACCOUNT MODEL: Use Pending State (Confirmed + Mempool)
      const result = Wallet.getPendingState({
        chain,
        address: this.publicKey,
        transactionPool,
      });
      pendingBalance = result.balance;
      nonce = result.nonce; // Correct Next Nonce
    }

    // Check availability against Pending Balance
    if (amount + (fee || 0n) > pendingBalance) {
      throw new Error(
        `Amount + fee exceeds balance. Available: ${pendingBalance}, Needed: ${amount + (fee || 0n)}`,
      );
    }

    // In Account Model, 'amount' in input implies Total Debit (Amount + Fee)
    // We do NOT create a change output.
    return new Transaction({
      senderWallet: this,
      recipient,
      amount,
      fee,
      nonce,
      inputAmount: amount + (fee || 0n), // Pass explicit input amount
      type,
      data,
    });
  }

  /**
   * Get ACCOUNT state (Confirmed Balance & Nonce) from blockchain only.
   * strictly separates committed state from pending state.
   */
  static getAccountState({ chain, address, state }) {
    if (state) {
      const account = state.getAccount(address);
      return { balance: account.balance, nonce: account.nonce };
    }

    let balance = INITIAL_BALANCE;
    let nonce = 0;

    for (let i = 1; i < chain.length; i++) {
      const block = chain[i];
      for (let transaction of block.data) {
        // 1. Handle Mining Rewards
        if (transaction.input.address === "*authorized-reward*") {
          if (transaction.outputMap[address]) {
            balance += BigInt(transaction.outputMap[address]);
          }
          continue;
        }

        // 2. Debit Sender
        if (transaction.input.address === address) {
          balance -= BigInt(transaction.input.amount);
          // Nonce increments for every CONFIRMED transaction from this address
          // In account model, nonce is usually count of confirmed txs
          // But simplified here: max(nonce, input.nonce + 1)
          nonce = Math.max(nonce, (transaction.input.nonce || 0) + 1);
        }

        // 3. Credit Recipient
        if (transaction.outputMap[address] !== undefined) {
          balance += BigInt(transaction.outputMap[address]);
        }
      }
    }
    return { balance, nonce };
  }

  /**
   * Get PENDING state (Projected Balance & Next Nonce).
   * Used for validating NEW transactions.
   * Starts with AccountState and applies pending TXs sequentially.
   */
  static getPendingState({ chain, address, transactionPool, state }) {
    // 1. Start with confirmed state
    const accountState = Wallet.getAccountState({ chain, address, state });
    let { balance, nonce } = accountState;

    if (transactionPool && transactionPool.transactionMap) {
      // 2. Get all pending transactions for this address
      const pendingTxs = Object.values(transactionPool.transactionMap).filter(
        (tx) => tx.input.address === address,
      );

      // 3. Sort by nonce to ensure sequential application
      pendingTxs.sort((a, b) => (a.input.nonce || 0) - (b.input.nonce || 0));

      // 4. Apply pending transactions sequentially
      for (const tx of pendingTxs) {
        // Strict Nonce Check: Next TX must have nonce === current nonce
        // If there's a gap, stop processing (future TXs are invalid/queued)
        if ((tx.input.nonce || 0) !== nonce) {
          break;
        }

        // Update State
        balance -= BigInt(tx.input.amount); // Deduct total input amount

        // Add back change if self-transfer (though properly handle in outputMap)
        if (tx.outputMap[address]) {
          balance += BigInt(tx.outputMap[address]);
        }

        nonce++; // Increment nonce
      }
    }

    return { balance, nonce };
  }

  /**
   * @deprecated Use getAccountState or getPendingState
   */
  static calculateBalance({ chain, address, transactionPool, state }) {
    if (transactionPool) {
      return Wallet.getPendingState({ chain, address, transactionPool, state });
    }
    return Wallet.getAccountState({ chain, address, state });
  }

  static getConfirmedBalance({ chain, address, state }) {
    return Wallet.getAccountState({ chain, address, state });
  }
}

export default Wallet;
