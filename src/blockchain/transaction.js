import { v1 as uuid } from "uuid";
import { verifySignature } from "../crypto/index.js";
import { MINING_REWARD, MINING_REWARD_INPUT } from "../config.js";

class Transaction {
  constructor({
    senderWallet,
    recipient,
    amount,
    fee,
    nonce,
    outputMap,
    input,
    id,
  }) {
    this.id = id || uuid();
    this.outputMap =
      outputMap ||
      this.createOutputMap({ senderWallet, recipient, amount, fee });
    this.input =
      input ||
      this.createInput({ senderWallet, outputMap: this.outputMap, nonce });
  }

  createOutputMap({ senderWallet, recipient, amount, fee = 0 }) {
    const outputMap = {};
    outputMap[recipient] = amount;
    outputMap[senderWallet.publicKey] = senderWallet.balance - amount - fee;
    return outputMap;
  }

  createInput({ senderWallet, outputMap, nonce }) {
    return {
      timestamp: Date.now(),
      amount: senderWallet.balance,
      address: senderWallet.publicKey,
      signature: senderWallet.sign(outputMap),
      nonce: nonce !== undefined ? nonce : 0, // Default to 0 for backward compatibility
    };
  }

  update({ senderWallet, recipient, amount }) {
    const senderOutput = this.outputMap[senderWallet.publicKey];

    if (amount > senderOutput) {
      throw new Error("Amount exceeds balance");
    }

    if (!this.outputMap[recipient]) {
      this.outputMap[recipient] = amount;
    } else {
      this.outputMap[recipient] = this.outputMap[recipient] + amount;
    }

    this.outputMap[senderWallet.publicKey] = senderOutput - amount;

    this.input = this.createInput({
      senderWallet,
      outputMap: this.outputMap,
      nonce: this.input.nonce,
    });
  }

  static validTransaction(transaction) {
    const {
      input: { address, amount, signature },
      outputMap,
    } = transaction;

    const outputTotal = Object.values(outputMap).reduce(
      (total, outputAmount) => total + outputAmount,
      0,
    );

    // Epsilon comparison for floating point tolerance
    // Allow input >= output (fees are the difference)
    const EPSILON = 0.00000001;

    if (amount < outputTotal - EPSILON) {
      console.error(
        `Invalid transaction amount from ${address}. ` +
          `Input: ${amount}, Output total: ${outputTotal}, ` +
          `Difference: ${amount - outputTotal}`,
      );
      return false;
    }

    if (!verifySignature({ publicKey: address, data: outputMap, signature })) {
      console.error(`Invalid signature from ${address}`);
      return false;
    }

    return true;
  }

  static rewardTransaction({ minerWallet, amount }) {
    return new this({
      input: MINING_REWARD_INPUT,
      outputMap: { [minerWallet.publicKey]: amount || MINING_REWARD },
    });
  }
}

export default Transaction;
