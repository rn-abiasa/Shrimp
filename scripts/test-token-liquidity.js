import fetch from "node-fetch";
import Wallet from "../src/wallet/index.js";
import Transaction from "../src/blockchain/transaction.js";
import { cryptoHash } from "../src/crypto/index.js";
import { toBaseUnits } from "../src/config.js";
import { stringify } from "../src/utils/json.js";
import fs from "fs";
import path from "path";

const API_URL = "http://localhost:3001";
const WALLET_PATH = path.resolve("wallets/deployer.json");

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function signAndSend(wallet, params) {
  const { recipient, amount = 0, fee = 10, type, data } = params;

  const nonceRes = await fetch(`${API_URL}/nonce?address=${wallet.publicKey}`);
  if (!nonceRes.ok)
    throw new Error(`Failed to fetch nonce: ${await nonceRes.text()}`);
  const { nonce } = await nonceRes.json();

  console.log(`📡 Sending ${type} (Nonce: ${nonce})...`);

  const transaction = new Transaction({
    senderWallet: wallet,
    recipient,
    amount: toBaseUnits(amount),
    fee: toBaseUnits(fee),
    nonce,
    type,
    data,
    inputAmount: toBaseUnits(amount) + toBaseUnits(fee),
  });

  const res = await fetch(`${API_URL}/transact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stringify({ transaction }),
  });

  const json = await res.json();
  if (json.type === "error") {
    console.error(`❌ Transaction Error: ${json.message}`);
    throw new Error(json.message);
  }
  console.log(
    `✅ Transaction added: ${json.transaction.id.substring(0, 8)}...`,
  );
  return { transaction, json };
}

async function mine(address) {
  console.log("⛏️  Triggering manual mine...");
  const res = await fetch(`${API_URL}/mine`, {
    method: "POST",
    body: JSON.stringify({ minerAddress: address }),
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) console.warn("Mining trigger failed:", await res.text());
  await delay(2000);
}

async function main() {
  const salt = Date.now().toString().slice(-4);
  console.log(`🚀 Starting AMM Integration Test (Salt: ${salt})...`);

  const walletData = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"));
  const wallet = new Wallet();
  wallet.recover(walletData.mnemonic);
  const address = wallet.publicKey;
  console.log(`👤 Wallet: ${address}`);

  // 1. Deploy Token
  console.log("📜 Deploying Test Token...");
  let tokenCode = fs.readFileSync("contracts/TestToken.js", "utf8");
  tokenCode += `\n// Salt: ${salt}`; // Force new address

  const { transaction: tokenTxObj } = await signAndSend(wallet, {
    type: "CREATE_CONTRACT",
    data: { code: tokenCode },
  });
  await mine(address);

  // 2. Deploy Pool
  console.log("📜 Deploying Pool...");
  let poolCode = fs.readFileSync("contracts/AMM_Pool.js", "utf8");
  poolCode += `\n// Salt: ${salt}`; // Force new address

  const { transaction: poolTxObj } = await signAndSend(wallet, {
    type: "CREATE_CONTRACT",
    data: { code: poolCode },
  });
  await mine(address);

  // 3. Discovery (Find precisely the ones we just deployed)
  console.log("🔍 Discovering contracts on chain...");
  const { contracts } = await (
    await fetch(`${API_URL}/api/explorer/contracts?limit=50`)
  ).json();

  let tokenAddress = null;
  let poolAddress = null;

  for (const c of contracts) {
    const details = await (
      await fetch(`${API_URL}/api/explorer/contract/${c.address}`)
    ).json();
    if (
      details.storage?.owner === address &&
      details.code.includes(`Salt: ${salt}`)
    ) {
      if (details.code.includes("Test Token")) tokenAddress = c.address;
      if (details.code.includes("shrimpBalance")) poolAddress = c.address;
    }
  }

  if (!tokenAddress || !poolAddress) {
    console.error("❌ Discovery Failed. Freshly deployed contracts not found.");
    process.exit(1);
  }

  console.log(`✅ New Token: ${tokenAddress}`);
  console.log(`✅ New Pool: ${poolAddress}`);

  // 4. Setup & Liquidity
  console.log("🔧 Setting up Pool...");
  await signAndSend(wallet, {
    recipient: poolAddress,
    type: "CALL_CONTRACT",
    data: { function: "setup", args: [tokenAddress] },
  });

  console.log("💧 Adding Liquidity...");
  await signAndSend(wallet, { recipient: poolAddress, amount: 100 });
  await signAndSend(wallet, {
    recipient: tokenAddress,
    type: "CALL_CONTRACT",
    data: { function: "transfer", args: [poolAddress, 10000000] },
  });

  console.log("🔄 Syncing Reserves...");
  await signAndSend(wallet, {
    recipient: poolAddress,
    type: "CALL_CONTRACT",
    data: { function: "syncReserves", args: [10000000000n, 10000000] },
  });

  await mine(address);

  // 5. Final Verification
  console.log("🔍 Final Verification...");
  const storage = await (
    await fetch(`${API_URL}/api/explorer/contract/${poolAddress}`)
  ).json();
  console.log("📊 Pool Storage:", storage.storage);

  if (
    storage.storage.shrimpBalance &&
    BigInt(storage.storage.shrimpBalance) > 0n
  ) {
    console.log("🎉 SUCCESS! AMM integration verified.");
  } else {
    console.error("❌ FAILED: Reserves not updated.");
  }
}

main().catch((e) => console.error("❌ Error:", e));
