const EC = require("elliptic").ec;

const ec = new EC("secp256k1");

const bip39 = require("bip39");

const crypto = require("crypto");

const mnemonic =
  "fatigue left soft quick limit small quarter lake velvet rich exchange target";

if (!bip39.validateMnemonic(mnemonic)) {
  console.error("Failed");
  return;
}

const seed = bip39.mnemonicToSeedSync(mnemonic);

const seedHex = seed.toString("hex");

const stringifiedSeed = JSON.stringify(seedHex);

const privateKey = crypto
  .createHash("sha256")
  .update(stringifiedSeed)
  .digest("hex");

const keyPair = ec.keyFromPrivate(privateKey);

const publicKey = keyPair.getPublic("hex");

const address = crypto.createHash("sha256").update(publicKey).digest("hex");

console.log("Private Key: ", privateKey);

console.log("Public Key: ", publicKey);

console.log("Address: ", address);

console.log("Request nonce....");

fetch(`http://localhost:3001/nonce?address=${publicKey}`)
  .then((response) => response.json())
  .then((data) => {
    console.log(data);

    const recipient =
      "0ef9588a0adfaa0cd6b6529f52dcb3dea5a9b7e5ebf73ae7ce3023fc6464c8c4";

    const amount = 100000000n;

    const fee = 1000000n;

    const outputMap = { [recipient]: amount.toString() };

    const dataToHash = JSON.stringify(outputMap);

    const msgHash = crypto.createHash("sha256").update(dataToHash).digest();

    const signature = keyPair.sign(msgHash).toDER("hex");

    const tx = {
      input: {
        timestamp: Date.now(),
        amount: (amount + fee).toString(),
        address: publicKey,
        signature,
        nonce: data.nonce,
        type: "TRANSFER",
      },
      outputMap,
    };

    fetch("http://localhost:3001/transact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: tx }),
    })
      .then((res) => res.json())
      .then((data) => console.log("Status: ", data));
  });
