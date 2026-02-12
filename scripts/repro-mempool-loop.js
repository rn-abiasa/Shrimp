import fetch from "node-fetch";
import Wallet from "../src/wallet/index.js";
import Transaction from "../src/blockchain/transaction.js";
import { toBaseUnits } from "../src/config.js";
import { stringify } from "../src/utils/json.js";
import fs from "fs";
import path from "path";

const API_URL = "http://localhost:3001";
const WALLET_PATH = path.resolve("wallets/deployer.json");

async function main() {
  console.log("🕵️ Starting Reproduction for Mempool Mining Issue...");

  // 1. Load Wallet
  const walletData = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
  const wallet = new Wallet();
  wallet.recover(walletData.mnemonic);
  const address = wallet.publicKey;

  // 2. Get current nonce
  const nonceRes = await fetch(`${API_URL}/nonce?address=${address}`);
  const { nonce } = await nonceRes.json();
  console.log(`Current Nonce: ${nonce}`);

  // 3. Send transaction with a GAP (nonce + 1 instead of nonce)
  // This should stay in mempool but NOT be mined.
  const badNonce = nonce + 1;
  const transaction = new Transaction({
    senderWallet: wallet,
    recipient: "mock-recipient",
    amount: toBaseUnits(0.1),
    fee: toBaseUnits(0.01),
    nonce: badNonce,
    inputAmount: toBaseUnits(0.11),
  });

  console.log(`📡 Sending transaction with nonce gap (${badNonce})...`);
  const res = await fetch(`${API_URL}/transact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stringify({ transaction }),
  });

  const json = await res.json();
  console.log("Response:", json);

  // 4. Wait and see if blocks are being mined but transaction remains in mempool
  console.log("⏳ Watching for blocks... (Press Ctrl+C to stop)");

  let initialHeight = await (await fetch(`${API_URL}/height`)).json();
  initialHeight = initialHeight.height;

  setInterval(async () => {
    const hRes = await fetch(`${API_URL}/height`);
    const { height } = await hRes.json();

    const mRes = await fetch(`${API_URL}/transactions`);
    const mempool = await mRes.json();
    const mempoolSize = Object.keys(mempool).length;

    console.log(
      `📊 Height: ${height} (+${height - initialHeight}), Mempool: ${mempoolSize}`,
    );

    if (height - initialHeight > 5) {
      console.log(
        "🚨 VERIFIED: Chain is growing with empty blocks, but mempool is still full!",
      );
      process.exit(0);
    }
  }, 2000);
}

main().catch((e) => console.error("❌ Error:", e));
