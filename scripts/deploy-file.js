import fetch from "node-fetch";
import { cryptoHash } from "../src/crypto/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = process.env.API_URL || "http://localhost:3001";

// Usage: node scripts/deploy-file.js <path-to-contract-file> [arg1] [arg2] ...
// Example: node scripts/deploy-file.js contracts/token.js

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: node scripts/deploy-file.js <contract-file>");
    process.exit(1);
  }

  const filePath = args[0];
  const absolutePath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`🚀 Deploying contract from: ${filePath}`);

  // 1. Read File Content
  let code = fs.readFileSync(absolutePath, "utf-8");

  // 2. Preprocess Code for VM Compatibility

  // A. Remove "export default " BUT keep the class definition
  // Replace "export default class Name" -> "class Name"
  code = code.replace(/export\s+default\s+class/, "class");

  // B. Find the class name
  const classMatch = code.match(/class\s+(\w+)/);
  if (!classMatch) {
    console.error("❌ Could not find a class definition in the file.");
    process.exit(1);
  }

  const className = classMatch[1];
  console.log(`📦 Found class: ${className}`);

  // C. Alias to SmartContract AND ensure it is assigned
  // If the user class is named "SmartContract", we are good.
  // If not, we append code to alias it.

  if (className !== "SmartContract") {
    // If user used "export default class Name {}", we replaced it with "class Name {}".
    // Now we just add:
    code += `\n\nconst SmartContract = ${className};`;
  }

  // 3. Get Wallet
  let walletRes;
  try {
    walletRes = await fetch(`${API_URL}/public-key`);
  } catch (e) {
    console.error("❌ Cannot connect to server at " + API_URL);
    process.exit(1);
  }
  const { publicKey: sender } = await walletRes.json();
  console.log("👤 Sender:", sender);

  // 4. Get Nonce
  const nonceRes = await fetch(`${API_URL}/nonce?address=${sender}`);
  const { nonce } = await nonceRes.json();
  console.log("🔢 Nonce:", nonce);

  // 5. Calculate Address
  const contractAddress = cryptoHash(sender, nonce, code);
  console.log("🔮 Expected Contract Address:", contractAddress);

  // 6. Deploy
  console.log("📜 Sending Deployment Transaction...");
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
  console.log("⏳ Waiting for confirmation...");

  // Poll for receipt
  // (Simplified: just wait 3s)
  await new Promise((r) => setTimeout(r, 3000));

  // 7. Verify
  const storageRes = await fetch(
    `${API_URL}/smart-contract/storage/${contractAddress}`,
  );
  if (storageRes.ok) {
    const storage = await storageRes.json();
    console.log("✅ Contract Deployed Successfully!");
    console.log("📦 Initial Storage:", storage);
    console.log(`\n👉 Contract Address: ${contractAddress}`);
  } else {
    console.log(
      "⚠️  Contract not found in state yet (might be pending). Check explorer.",
    );
  }
}

main().catch(console.error);
