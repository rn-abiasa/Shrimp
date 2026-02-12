import fetch from "node-fetch";
import { cryptoHash } from "../src/crypto/index.js";

const API_URL = process.env.API_URL || "http://localhost:3001"; // Default port is 3001 ? check server.js (3001 or 3000?)
// config.js says HTTP_PORT or process.env.
// Usually 3001.

// Simple delay helper
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("🚀 Starting verification on LIVE node...");

  // 1. Get Wallet Public Key
  let walletRes;
  try {
    walletRes = await fetch(`${API_URL}/public-key`);
  } catch (e) {
    console.error("❌ Cannot connect to server at " + API_URL);
    console.error("👉 Please ensure the server is running: 'npm run dev'");
    process.exit(1);
  }

  if (!walletRes.ok) {
    console.error("❌ Failed to fetch wallet:", await walletRes.text());
    process.exit(1);
  }

  if (!walletRes.ok) {
    console.error("❌ Failed to fetch wallet:", await walletRes.text());
    process.exit(1);
  }

  const { publicKey: sender } = await walletRes.json();
  console.log("👤 Sender:", sender);

  // 2. Get Nonce
  const nonceRes = await fetch(`${API_URL}/nonce?address=${sender}`);
  const { nonce } = await nonceRes.json();
  console.log("🔢 Nonce:", nonce);

  // 2b. Check Balance & Funding
  let balanceRes = await fetch(`${API_URL}/balance?address=${sender}`);
  let { balance } = await balanceRes.json();
  console.log("💰 Balance:", balance);

  if (BigInt(balance) < 1000000000n) {
    // Need at least 10 fee (10^9 units)
    console.log("⚠️  Insufficient balance. Mining for funds...");
    await fetch(`${API_URL}/mine`, {
      method: "POST",
      body: JSON.stringify({ minerAddress: sender }),
      headers: { "Content-Type": "application/json" },
    });
    console.log("⛏️  Block mined. Waiting for balance update...");
    await delay(2000);

    // Re-check
    balanceRes = await fetch(`${API_URL}/balance?address=${sender}`);
    const data = await balanceRes.json();
    balance = data.balance;
    console.log("💰 New Balance:", balance);
  }

  // 3. Define Contract
  const code = `
  class SmartContract {
    init() {
      this.state.name = "Bob";
      this.state.owner = this.sender;
    }
    set(name) {
      this.state.name = name;
    }
  }
  `;

  // 4. Calculate Expected Contract Address
  // address = hash(sender, nonce, code)
  const contractAddress = cryptoHash(sender, nonce, code);
  console.log("🔮 Expected Contract Address:", contractAddress);

  // 5. Deploy Contract
  console.log("📜 Deploying Contract...");
  const deployRes = await fetch(`${API_URL}/transact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: null,
      amount: 0,
      fee: 10,
      type: "CREATE_CONTRACT",
      data: { code },
    }),
  });

  const deployJson = await deployRes.json();
  if (deployJson.type === "error") {
    console.error("❌ Deployment Failed:", deployJson.message);
    process.exit(1);
  }
  console.log("✅ Deployment TX Sent:", deployJson.transaction.id);

  // Wait for mining (assuming auto-mining is ON or triggered)
  // If auto-mining is off, we might need to trigger it.
  // Check miner status
  const mineStatusRes = await fetch(`${API_URL}/miner/status`);
  const { isAutoMining } = await mineStatusRes.json();

  if (!isAutoMining) {
    console.log("⛏️  Triggering manual mine...");
    await fetch(`${API_URL}/mine`, {
      method: "POST",
      body: JSON.stringify({ minerAddress: sender }),
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("⏳ Waiting for block confirmation...");
  await delay(2000); // Wait 2s

  // 6. Verify Deployment (Check Storage)
  console.log("🔍 Verifying Contract Storage...");
  const storageRes = await fetch(
    `${API_URL}/smart-contract/storage/${contractAddress}`,
  );
  if (storageRes.status !== 200) {
    console.error("❌ Contract not found in state yet.");
  } else {
    const storage = await storageRes.json();
    console.log("📦 Initial Storage:", storage);
  }

  // 7. Call Contract
  console.log("📞 Calling 'set(\"Alice\")'...");
  const callRes = await fetch(`${API_URL}/transact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: contractAddress, // Target is contract address
      amount: 0,
      fee: 10,
      type: "CALL_CONTRACT",
      data: {
        function: "set",
        args: ["Alice"],
      },
    }),
  });

  if (!callRes.ok) {
    const text = await callRes.text();
    console.error("❌ Call Transaction Failed:", text);
    process.exit(1);
  }

  const callJson = await callRes.json();
  console.log("✅ Call TX Sent:", callJson.transaction.id);

  if (!isAutoMining) {
    console.log("⛏️  Triggering manual mine...");
    await fetch(`${API_URL}/mine`, {
      method: "POST",
      body: JSON.stringify({ minerAddress: sender }),
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("⏳ Waiting for block confirmation...");
  await delay(2000);

  // 8. Verify State Change
  const finalStorageRes = await fetch(
    `${API_URL}/smart-contract/storage/${contractAddress}`,
  );
  const finalStorage = await finalStorageRes.json();
  console.log("📊 Final Storage:", finalStorage);

  if (finalStorage.name === "Alice") {
    console.log("✅ LIVE TEST SUCCESS!");
  } else {
    console.error(
      `❌ LIVE TEST FAILED. Expected name: 'Alice', Got: '${finalStorage.name}'`,
    );
  }
}

main().catch(console.error);
