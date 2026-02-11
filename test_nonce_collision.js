import fetch from "node-fetch";

const API_URL = "http://localhost:3001";

async function testNonceCollision() {
  console.log("🚀 Starting Nonce Collision Test...");

  // 1. Get Wallet Balance & Nonce first
  const walletRes = await fetch(`${API_URL}/balance`);
  const walletData = await walletRes.json();
  const address = walletData.address;

  console.log(`Testing with address: ${address}`);
  console.log(`Initial Nonce: ${walletData.nonce}`);

  // 2. Create two payloads
  const payload1 = {
    recipient: "TEST_RECIPIENT_1",
    amount: 1,
    fee: 0,
  };
  const payload2 = {
    recipient: "TEST_RECIPIENT_2",
    amount: 1,
    fee: 0,
  };

  // 3. Send them almost simultaneously
  console.log("Sending TX 1...");
  const p1 = fetch(`${API_URL}/transact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload1),
  }).then((r) => r.json());

  // Small delay to ensure order but still fast enough to hit mempool
  await new Promise((r) => setTimeout(r, 100));

  console.log("Sending TX 2...");
  const p2 = fetch(`${API_URL}/transact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload2),
  }).then((r) => r.json());

  const [res1, res2] = await Promise.all([p1, p2]);

  console.log("\n--- RESULT ---");
  console.log("TX 1:", res1);
  console.log("TX 2:", res2);

  if (res1.type === "error" || res2.type === "error") {
    console.error("❌ Test FAILED: One transaction failed.");
  } else {
    console.log("✅ Test PASSED: Both transactions accepted.");
  }
}

testNonceCollision();
