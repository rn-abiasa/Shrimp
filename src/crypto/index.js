import elliptic from "elliptic";
import crypto from "crypto";
import { v1 as uuidV1 } from "uuid";

const { ec: EC } = elliptic;
const ec = new EC("secp256k1");

export const genKeyPair = () => {
  return ec.genKeyPair();
};

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

export const cryptoHash = (...inputs) => {
  const hash = crypto.createHash("sha256");
  hash.update(
    inputs
      .map((input) => stableStringify(input))
      .sort()
      .join(" "),
  );
  return hash.digest("hex");
};

export const verifySignature = ({ publicKey, data, signature }) => {
  const keyFromPublic = ec.keyFromPublic(publicKey, "hex");
  return keyFromPublic.verify(cryptoHash(data), signature);
};
