import Transaction from "./transaction.js";
import Wallet from "../wallet/index.js";

class Mempool {
  constructor() {
    this.transactionMap = {};
  }

  setTransaction(transaction) {
    this.transactionMap[transaction.id] = transaction;
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

      const trueBalance = Wallet.calculateBalance({
        chain,
        address: transaction.input.address,
      });

      // If the transaction's input amount doesn't match the current balance, remove it
      // Use epsilon comparison for floating point tolerance
      const EPSILON = 0.00000001;
      const difference = Math.abs(transaction.input.amount - trueBalance);

      if (difference > EPSILON) {
        console.log(
          `Removing invalid transaction ${transaction.id} from mempool. ` +
            `Expected balance: ${trueBalance}, Got: ${transaction.input.amount}, Difference: ${difference}`,
        );
        delete this.transactionMap[transaction.id];
      }
    }
  }
}

export default Mempool;
