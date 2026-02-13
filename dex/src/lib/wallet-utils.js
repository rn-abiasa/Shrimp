import * as bip39 from "bip39";
import elliptic from "elliptic";
import { Buffer } from "buffer";
import { sha256 } from "js-sha256";

const { ec: EC } = elliptic;
const ec = new EC("secp256k1");

// Polyfill Buffer for the browser if needed
if (typeof window !== "undefined") {
  window.Buffer = Buffer;
}

const stableStringify = (data) => {
  if (typeof data === "bigint") {
    return JSON.stringify(data.toString());
  }
  if (typeof data !== "object" || data === null) {
    return JSON.stringify(data);
  }
  if (Array.isArray(data)) {
    return "[" + data.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(data).sort();
  return (
    "{" +
    keys
      .map((key) => JSON.stringify(key) + ":" + stableStringify(data[key]))
      .join(",") +
    "}"
  );
};

const cryptoHash = (...inputs) => {
  const data = inputs
    .map((input) => stableStringify(input))
    .sort()
    .join(" ");
  return sha256(data);
};

export class WebWalletUtils {
  static generateMnemonic() {
    return bip39.generateMnemonic();
  }

  static validateMnemonic(mnemonic) {
    return bip39.validateMnemonic(mnemonic);
  }

  static deriveKeyPair(mnemonic) {
    if (!this.validateMnemonic(mnemonic)) throw new Error("Invalid mnemonic");

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const privateKey = cryptoHash(seed.toString("hex"));

    const keyPair = ec.keyFromPrivate(privateKey);
    const publicKey = keyPair.getPublic("hex");
    const address = publicKey; // Standardize on publicKey as address for ECC compatibility

    return {
      keyPair,
      publicKey,
      address,
      mnemonic,
    };
  }

  static calculateContractAddress(sender, nonce, code) {
    return cryptoHash(sender, nonce, code);
  }

  static sign(keyPair, data) {
    return keyPair.sign(cryptoHash(data)).toDER("hex");
  }

  static createTransactionData({
    senderAddress,
    recipient,
    amount,
    fee,
    nonce,
    type,
    data,
    keyPair,
  }) {
    const amt = BigInt(amount || 0);
    const f = BigInt(fee || 0);

    const transaction = {
      id: null,
      input: {
        timestamp: Date.now(),
        amount: amt + f,
        address: senderAddress,
        nonce: nonce,
        signature: null,
      },
      outputMap: {
        [recipient]: amt,
      },
      type: type || "TRANSFER",
      data: data || null,
    };

    // Calculate ID (hash of outputs + type + data)
    transaction.id = cryptoHash(
      transaction.outputMap,
      transaction.type,
      transaction.data,
    );

    // Sign only the outputMap (matches backend logic)
    transaction.input.signature = this.sign(keyPair, transaction.outputMap);

    return transaction;
  }
}
