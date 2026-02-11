import fetch from "node-fetch";

const API_URL = "http://localhost:3001";

async function testNonceIncrement() {
  console.log("🚀 Testing Nonce Increment from Mempool...");

  // 1. Get Initial Nonce
  const r1 = await fetch(`${API_URL}/balance`);
  const d1 = await r1.json();
  const startNonce = d1.nonce;
  const address = d1.address;

  console.log(`Initial Nonce: ${startNonce}`);

  // 2. Send ONE transaction (this will be added to mempool)
  console.log("Sending Transaction...");
  const p1 = await fetch(`${API_URL}/transact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: "TEST_RECIPIENT",
      amount: 1,
    }),
  }).then((r) => r.json());

  if (p1.type === "error") {
    console.error("❌ Setup failed: Could not send transaction", p1.message);
    return;
  }
  console.log("✅ Transaction added to mempool.");

  // 3. Immediately Query Nonce Again
  // It SHOULD be (startNonce + 1) because of the pending tx
  const r2 = await fetch(`${API_URL}/nonce?address=${address}`);
  const d2 = await r2.json();
  const endNonce = d2.nonce;

  console.log(`Final Nonce from API: ${endNonce}`);

  if (endNonce > startNonce) {
    console.log("✅ SUCCESS: API correctly accounts for pending transaction!");
  } else {
    console.error("❌ FAILURE: Nonce did NOT increment. API ignores mempool.");
    console.log(`Expected: ${startNonce + 1}, Got: ${endNonce}`);
  }
}

testNonceIncrement();
