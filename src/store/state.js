import { INITIAL_BALANCE } from "../config.js";

class GlobalState {
  constructor(initialState = {}) {
    this.accountState = initialState; // { address: { balance, nonce, code, storage } }
  }

  clone() {
    return new GlobalState(this.deepClone(this.accountState));
  }

  deepClone(obj) {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepClone(item));
    }

    const cloned = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }
    return cloned;
  }

  putAccount({ address, accountData }) {
    this.accountState[address] = accountData;
  }

  // Helper to ensure account object structure
  ensureAccount(address) {
    if (!this.accountState[address]) {
      this.accountState[address] = {
        balance: INITIAL_BALANCE,
        nonce: 0,
        code: null,
        storage: {},
      };
    }
    return this.accountState[address];
  }

  getAccount(address) {
    return (
      this.accountState[address] || {
        balance: INITIAL_BALANCE,
        nonce: 0,
        code: null,
        storage: {},
      }
    );
  }

  // Get balance for an address
  getBalance(address) {
    return this.getAccount(address).balance;
  }

  // Get nonce for an address
  getNonce(address) {
    return this.getAccount(address).nonce;
  }

  // Get contract code
  getCode(address) {
    return this.getAccount(address).code;
  }

  // Get contract storage value
  getStorage(address, key) {
    return this.getAccount(address).storage[key];
  }

  // Update contract storage
  updateStorage(address, key, value) {
    const account = this.getAccount(address);
    if (!account.storage) account.storage = {};
    account.storage[key] = value;
    this.putAccount({ address, accountData: account });
  }

  // Commit a transaction to state
  commitTransaction(transaction) {
    // 1. Sender: Deduct balance, increment nonce
    const sender = transaction.input.address;
    const senderAccount = this.getAccount(sender);

    // Calculate total spend (amount + fee)
    // Note: in our model input.amount is "Total Debit" (Amount + Fee)
    // But let's look at how we validate: outputTotal + fee = input.amount
    // We should deduct `input.amount` from sender balance.

    senderAccount.balance -= BigInt(transaction.input.amount);
    senderAccount.nonce = (transaction.input.nonce || 0) + 1;
    this.putAccount({ address: sender, accountData: senderAccount });

    // 2. Recipients: Credit balance
    if (transaction.outputMap) {
      for (const [recipient, amount] of Object.entries(transaction.outputMap)) {
        const recipientAccount = this.getAccount(recipient);
        recipientAccount.balance += BigInt(amount);
        this.putAccount({ address: recipient, accountData: recipientAccount });
      }
    }
  }
}

export default GlobalState;
