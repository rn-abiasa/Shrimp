import { v1 as uuid } from "uuid";
import { verifySignature } from "../crypto/index.js";
import { MINING_REWARD, MINING_REWARD_INPUT } from "../config.js";

import { TRANSACTION_TYPE } from "../config.js";

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
    inputAmount,
    type,
    data,
  }) {
    this.id = id || uuid();
    this.type = type || TRANSACTION_TYPE.TRANSFER;
    this.data = data || null;

    this.outputMap =
      outputMap ||
      this.createOutputMap({ senderWallet, recipient, amount, fee });
    this.input =
      input ||
      this.createInput({
        senderWallet,
        outputMap: this.outputMap,
        nonce,
        inputAmount,
      }); // Pass inputAmount
  }

  createOutputMap({ senderWallet, recipient, amount, fee = 0n }) {
    const outputMap = {};
    if (recipient) {
      outputMap[recipient] = amount;
    }
    // ACCOUNT MODEL: No change outputs!
    // The "fee" is implied by (Input Amount - Output Amount)
    return outputMap;
  }

  createInput({ senderWallet, outputMap, nonce, inputAmount }) {
    return {
      timestamp: Date.now(),
      amount: inputAmount || 0n, // Use explicit amount (Total Debit)
      address: senderWallet.publicKey,
      signature: senderWallet.sign(outputMap),
      nonce: nonce !== undefined ? nonce : 0,
      type: this.type,
      data: this.data,
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

  static validTransaction(transaction, accountState) {
    const {
      input: { address, amount, signature, nonce },
      outputMap,
    } = transaction;

    const outputTotal = Object.values(outputMap).reduce(
      (total, outputAmount) => total + BigInt(outputAmount),
      0n,
    );

    // 1. Basic sanity check (input >= output)
    if (BigInt(amount) < outputTotal) {
      console.error(
        `Invalid transaction amount from ${address}. ` +
          `Input: ${amount}, Output total: ${outputTotal}`,
      );
      return false;
    }

    // 2. Signature check
    if (!verifySignature({ publicKey: address, data: outputMap, signature })) {
      console.error(`Invalid signature from ${address}`);
      return false;
    }

    // 3. Stateful check (if state provided) - Account-Based Logic
    if (accountState) {
      // Strict Nonce Check
      if (nonce !== accountState.nonce) {
        console.error(
          `Invalid nonce for ${address}. Expected: ${accountState.nonce}, Got: ${nonce}`,
        );
        return false;
      }

      // Strict Balance Check
      // In Account model, input.amount IS the amount being spent, NOT the total balance.
      // Wait, the previous implementation had input.amount = total_balance.
      // I need to change how transactions are CREATED too.
      // Account model: input.amount = amount + fee? Or just amount?
      // Usually Account model transactions don't have "input.amount" as "balance".
      // They just have "amount" and "fee".
      // But to keep it compatible with existing structures:

      // OLD: input.amount = senderWallet.balance (UTXO-like artifact?)
      // The previous code: `createInput ... amount: senderWallet.balance`

      // I should probably change the input structure to NOT include total balance if possible,
      // or just ignore it for validation and check funds against accountState.

      const spendAmount = outputTotal; // Total spent (amount + fee + change?)
      // Wait, outputMap has change?
      // Account model DOES NOT have change outputs!
      // Usage: Sender -> Recipient: 10, Sender -> Sender: 90 (Change)

      // User requested: "Account-based model"
      // In Account model:
      // Tx: { to: Recipient, amount: 10, fee: 1, nonce: 5 }
      // Balance Check: balance >= 10 + 1
      // New Balance: balance - 11

      // CURRENT IMPLEMENTATION uses OutputMap with Change.
      // It is a Hybrid.
      // The user said: "Account-based model with nonce... saldo direserve untuk tx pending"

      // Strategies:
      // A. Full rewrite to strict Account Model (remove OutputMap, use To/Amount/Fee).
      // B. Adapt OutputMap to enforce Account constraints (Change output must match balance - spent).

      // Given existing codebase heaviness, B is safer but A is "Real Blockchain".
      // The user said "Gunakan cara blockchain nyata... account-based model".

      // Let's check `createOutputMap` in `transaction.js` again.
      // It calculates change: `senderWallet.balance - amount - fee`.

      // If I change to strict Account model, I should remove `outputMap` logic for sender change.
      // But `outputMap` is deeply integrated.

      // Compromise:
      // Keep `outputMap` but VALIDATE that `input.amount` (total spent?) <= `accountState.balance`.
      // Actually, if we use Account Model, `input.amount` shouldn't be "Total Balance".
      // It should be ignored, or set to 0.

      // For `validTransaction(..., state)`:
      // We calculate `totalDebits` (sum of outputs not to self? No, `outputMap` has change).
      // If strict Account model, we don't do change outputs.

      // Let's stick to the current Transaction structure (OutputMap) but enforce ordering.
      // AND ensure that the `input.amount` claimed matches the `accountState.balance`?
      // No, in Account model, we don't include the balance in the TX.

      // OK, I will perform a CHECK against `accountState.balance`.
      // Total Spend = Total Output - Change?
      // If we keep Change output, it implies UTXO-style "spend everything, get change".

      // REFACTOR START:
      // I will change `createTransaction` in Wallet to NOT output change to self.
      // I will change `validTransaction` to check `totalOutput <= accountState.balance`.

      const totalCost = Object.entries(outputMap).reduce((acc, [addr, val]) => {
        // In pure account model, we don't have change.
        // If we see sender address in output, it's a self-transfer?
        return acc + BigInt(val);
      }, 0n);

      if (totalCost > accountState.balance) {
        console.error(
          `Insufficient balance for ${address}. Balance: ${accountState.balance}, Needed: ${totalCost}`,
        );
        return false;
      }
    }

    return true;
  }

  static rewardTransaction({ minerWallet, amount }) {
    return new this({
      input: MINING_REWARD_INPUT,
      outputMap: { [minerWallet.publicKey]: amount || MINING_REWARD },
    });
  }

  static createContract({ senderWallet, code, fee, nonce }) {
    return new this({
      senderWallet,
      recipient: null,
      amount: 0n,
      fee,
      nonce,
      type: TRANSACTION_TYPE.CREATE_CONTRACT,
      data: { code },
      inputAmount: fee,
    });
  }

  static callContract({
    senderWallet,
    contractAddress,
    func,
    args,
    fee,
    nonce,
  }) {
    return new this({
      senderWallet,
      recipient: contractAddress,
      amount: 0n,
      fee,
      nonce,
      type: TRANSACTION_TYPE.CALL_CONTRACT,
      data: { function: func, args },
      inputAmount: fee,
    });
  }

  static fromJSON(json) {
    // Rehydrate a transaction from JSON (strings -> BigInt)
    const outputMap = {};
    for (const [key, value] of Object.entries(json.outputMap)) {
      outputMap[key] = BigInt(value);
    }

    const input = {
      ...json.input,
      amount: BigInt(json.input.amount || 0),
      // signature is string, address is string, nonce is number
    };

    return new Transaction({
      id: json.id,
      type: json.type,
      data: json.data,
      outputMap,
      input,
    });
  }
}

export default Transaction;
