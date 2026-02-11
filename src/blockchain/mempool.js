import Transaction from "./transaction.js";
import Wallet from "../wallet/index.js";

class Mempool {
  constructor() {
    this.transactionMap = {};
  }

  // Add blockchain reference
  setBlockchain(blockchain) {
    this.blockchain = blockchain;
  }

  setTransaction(transaction) {
    // 1. Validate transaction signature and structure
    if (!Transaction.validTransaction(transaction)) {
      console.error(
        `❌ Mempool rejected: Invalid transaction signature from ${transaction.input.address}`,
      );
      throw new Error("Invalid transaction signature or structure");
    }

    // 2. Validate against CONFIRMED balance (prevent double spending)
    if (this.blockchain) {
      const { balance: confirmedBalance } = Wallet.getConfirmedBalance({
        chain: this.blockchain.chain,
        address: transaction.input.address,
      });

      if (transaction.input.amount > confirmedBalance) {
        console.error(
          `❌ Mempool rejected: Insufficient confirmed balance for ${transaction.input.address}. ` +
            `Have: ${confirmedBalance}, Trying to spend: ${transaction.input.amount}`,
        );
        throw new Error(
          `Insufficient confirmed balance. Have: ${confirmedBalance}, Need: ${transaction.input.amount}`,
        );
      }

      // 3. Check for duplicate nonce in mempool (prevent double spending)
      const existingTx = Object.values(this.transactionMap).find(
        (tx) =>
          tx.input.address === transaction.input.address &&
          tx.input.nonce === transaction.input.nonce,
      );

      if (existingTx && existingTx.id !== transaction.id) {
        console.error(
          `❌ Mempool rejected: Duplicate nonce ${transaction.input.nonce} from ${transaction.input.address}`,
        );
        throw new Error(
          `Transaction with nonce ${transaction.input.nonce} already exists in mempool`,
        );
      }
    }

    // 4. Add to mempool
    this.transactionMap[transaction.id] = transaction;
    console.log(
      `✅ Transaction ${transaction.id.substring(0, 8)}... added to mempool`,
    );
  }

  setMap(transactionMap) {
    this.transactionMap = transactionMap;
  }

  existingTransaction({ inputAddress }) {
    const transactions = Object.values(this.transactionMap);
    return transactions.find(
      (transaction) => transaction.input.address === inputAddress,
    );
  }

  validTransactions() {
    return Object.values(this.transactionMap).filter((transaction) =>
      Transaction.validTransaction(transaction),
    );
  }

  clear() {
    this.transactionMap = {};
  }

  clearBlockchainTransactions({ chain }) {
    for (let i = 1; i < chain.length; i++) {
      const block = chain[i];
      for (let transaction of block.data) {
        if (this.transactionMap[transaction.id]) {
          delete this.transactionMap[transaction.id];
        }
      }
    }
  }

  clearInvalidTransactions({ chain }) {
    const transactions = Object.values(this.transactionMap);

    for (const transaction of transactions) {
      // Skip reward transactions
      if (transaction.input.address === "*authorized-reward*") {
        continue;
      }

      // Use CONFIRMED balance for validation
      const result = Wallet.getConfirmedBalance({
        chain,
        address: transaction.input.address,
      });
      const confirmedBalance = result.balance;

      // Calculate total amount being spent (all outputs except sender's change)
      let totalSpent = 0;
      for (const [recipient, amount] of Object.entries(transaction.outputMap)) {
        if (recipient !== transaction.input.address) {
          totalSpent += amount;
        }
      }

      // If total spent exceeds confirmed balance, remove transaction
      if (totalSpent > confirmedBalance) {
        console.log(
          `Removing invalid transaction ${transaction.id} from mempool. ` +
            `Confirmed balance: ${confirmedBalance}, Trying to spend: ${totalSpent}`,
        );
        delete this.transactionMap[transaction.id];
      }
    }
  }
}

export default Mempool;
