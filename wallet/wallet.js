// ShrimpChain Web Wallet - Client-side Logic
// API Configuration
const API_URL = "http://localhost:3001";

// Wallet State
let currentWallet = null;

// Utility: Generate UUID v4
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Stable Stringify (matches server implementation)
function stableStringify(data) {
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
}

// Utility: Crypto Hash (SHA-256) - matches server implementation
function cryptoHash(...inputs) {
  const hash = CryptoJS.SHA256(
    inputs
      .map((input) => stableStringify(input))
      .sort()
      .join(" "),
  );
  return hash.toString();
}

// Initialize on page load
window.addEventListener("DOMContentLoaded", () => {
  checkExistingWallet();
});

// Check if wallet exists in localStorage
function checkExistingWallet() {
  const savedWallet = localStorage.getItem("shrimpchain_wallet");
  if (savedWallet) {
    currentWallet = JSON.parse(savedWallet);
    showDashboard();
  }
}

// BIP39 English wordlist (first 256 words for simplicity)
const BIP39_WORDLIST = [
  "abandon",
  "ability",
  "able",
  "about",
  "above",
  "absent",
  "absorb",
  "abstract",
  "absurd",
  "abuse",
  "access",
  "accident",
  "account",
  "accuse",
  "achieve",
  "acid",
  "acoustic",
  "acquire",
  "across",
  "act",
  "action",
  "actor",
  "actress",
  "actual",
  "adapt",
  "add",
  "addict",
  "address",
  "adjust",
  "admit",
  "adult",
  "advance",
  "advice",
  "aerobic",
  "affair",
  "afford",
  "afraid",
  "again",
  "age",
  "agent",
  "agree",
  "ahead",
  "aim",
  "air",
  "airport",
  "aisle",
  "alarm",
  "album",
  "alcohol",
  "alert",
  "alien",
  "all",
  "alley",
  "allow",
  "almost",
  "alone",
  "alpha",
  "already",
  "also",
  "alter",
  "always",
  "amateur",
  "amazing",
  "among",
  "amount",
  "amused",
  "analyst",
  "anchor",
  "ancient",
  "anger",
  "angle",
  "angry",
  "animal",
  "ankle",
  "announce",
  "annual",
  "another",
  "answer",
  "antenna",
  "antique",
  "anxiety",
  "any",
  "apart",
  "apology",
  "appear",
  "apple",
  "approve",
  "april",
  "arch",
  "arctic",
  "area",
  "arena",
  "argue",
  "arm",
  "armed",
  "armor",
  "army",
  "around",
  "arrange",
  "arrest",
  "arrive",
  "arrow",
  "art",
  "artefact",
  "artist",
  "artwork",
  "ask",
  "aspect",
  "assault",
  "asset",
  "assist",
  "assume",
  "asthma",
  "athlete",
  "atom",
  "attack",
  "attend",
  "attitude",
  "attract",
  "auction",
  "audit",
  "august",
  "aunt",
  "author",
  "auto",
  "autumn",
  "average",
  "avocado",
  "avoid",
  "awake",
  "aware",
  "away",
  "awesome",
  "awful",
  "awkward",
  "axis",
  "baby",
  "bachelor",
  "bacon",
  "badge",
  "bag",
  "balance",
  "balcony",
  "ball",
  "bamboo",
  "banana",
  "banner",
  "bar",
  "barely",
  "bargain",
  "barrel",
  "base",
  "basic",
  "basket",
  "battle",
  "beach",
  "bean",
  "beauty",
  "because",
  "become",
  "beef",
  "before",
  "begin",
  "behave",
  "behind",
  "believe",
  "below",
  "belt",
  "bench",
  "benefit",
  "best",
  "betray",
  "better",
  "between",
  "beyond",
  "bicycle",
  "bid",
  "bike",
  "bind",
  "biology",
  "bird",
  "birth",
  "bitter",
  "black",
  "blade",
  "blame",
  "blanket",
  "blast",
  "bleak",
  "bless",
  "blind",
  "blood",
  "blossom",
  "blouse",
  "blue",
  "blur",
  "blush",
  "board",
  "boat",
  "body",
  "boil",
  "bomb",
  "bone",
  "bonus",
  "book",
  "boost",
  "border",
  "boring",
  "borrow",
  "boss",
  "bottom",
  "bounce",
  "box",
  "boy",
  "bracket",
  "brain",
  "brand",
  "brass",
  "brave",
  "bread",
  "breeze",
  "brick",
  "bridge",
  "brief",
  "bright",
  "bring",
  "brisk",
  "broccoli",
  "broken",
  "bronze",
  "broom",
  "brother",
  "brown",
  "brush",
  "bubble",
  "buddy",
  "budget",
  "buffalo",
  "build",
  "bulb",
  "bulk",
  "bullet",
  "bundle",
  "bunker",
  "burden",
  "burger",
  "burst",
  "bus",
  "business",
  "busy",
  "butter",
  "buyer",
  "buzz",
  "cabbage",
  "cabin",
  "cable",
  "cactus",
  "cage",
  "cake",
  "call",
  "calm",
  "camera",
  "camp",
  "can",
  "canal",
  "cancel",
  "candy",
  "cannon",
  "canoe",
  "canvas",
  "canyon",
  "capable",
  "capital",
  "captain",
  "car",
  "carbon",
  "card",
  "cargo",
  "carpet",
  "carry",
  "cart",
  "case",
  "cash",
  "casino",
  "castle",
  "casual",
  "cat",
  "catalog",
  "catch",
  "category",
  "cattle",
  "caught",
  "cause",
  "caution",
  "cave",
  "ceiling",
  "celery",
  "cement",
  "census",
  "century",
  "cereal",
  "certain",
  "chair",
  "chalk",
  "champion",
  "change",
  "chaos",
  "chapter",
  "charge",
  "chase",
  "chat",
  "cheap",
  "check",
  "cheese",
  "chef",
  "cherry",
  "chest",
  "chicken",
  "chief",
  "child",
  "chimney",
  "choice",
  "choose",
  "chronic",
  "chuckle",
  "chunk",
  "churn",
  "cigar",
  "cinnamon",
  "circle",
  "citizen",
  "city",
  "civil",
  "claim",
  "clap",
  "clarify",
  "claw",
  "clay",
  "clean",
  "clerk",
  "clever",
  "click",
  "client",
  "cliff",
  "climb",
  "clinic",
  "clip",
  "clock",
  "clog",
  "close",
  "cloth",
  "cloud",
  "clown",
  "club",
  "clump",
  "cluster",
  "clutch",
  "coach",
  "coast",
  "coconut",
  "code",
  "coffee",
  "coil",
  "coin",
  "collect",
  "color",
  "column",
  "combine",
  "come",
  "comfort",
  "comic",
  "common",
  "company",
  "concert",
  "conduct",
  "confirm",
  "congress",
  "connect",
  "consider",
  "control",
  "convince",
  "cook",
  "cool",
  "copper",
  "copy",
  "coral",
  "core",
  "corn",
  "correct",
  "cost",
  "cotton",
  "couch",
  "country",
  "couple",
  "course",
  "cousin",
  "cover",
  "coyote",
  "crack",
  "cradle",
  "craft",
  "cram",
  "crane",
  "crash",
  "crater",
  "crawl",
  "crazy",
  "cream",
  "credit",
  "creek",
  "crew",
  "cricket",
  "crime",
  "crisp",
  "critic",
  "crop",
  "cross",
  "crouch",
  "crowd",
  "crucial",
  "cruel",
];

// Show Create Wallet Modal
function showCreateWallet() {
  // Generate mnemonic using crypto random
  const mnemonic = generateMnemonic();
  document.getElementById("mnemonic-display").textContent = mnemonic;
  document.getElementById("create-modal").classList.remove("hidden");

  // Enable confirm button when checkbox is checked
  document.getElementById("mnemonic-saved").addEventListener("change", (e) => {
    document.getElementById("confirm-create-btn").disabled = !e.target.checked;
  });

  // Store mnemonic temporarily
  window.tempMnemonic = mnemonic;
}

// Generate Mnemonic (12 words)
function generateMnemonic() {
  const words = [];
  const randomBytes = new Uint8Array(16); // 128 bits for 12 words
  crypto.getRandomValues(randomBytes);

  for (let i = 0; i < 12; i++) {
    const index = randomBytes[i] % BIP39_WORDLIST.length;
    words.push(BIP39_WORDLIST[index]);
  }

  return words.join(" ");
}

// Mnemonic to Seed (simplified)
function mnemonicToSeed(mnemonic) {
  // Use SHA-256 hash of mnemonic as seed
  const hash = CryptoJS.SHA256(mnemonic);
  return hash.toString().substring(0, 64);
}

// Hide Create Wallet Modal
function hideCreateWallet() {
  document.getElementById("create-modal").classList.add("hidden");
  document.getElementById("mnemonic-saved").checked = false;
  document.getElementById("confirm-create-btn").disabled = true;
  window.tempMnemonic = null;
}

// Confirm Create Wallet
function confirmCreateWallet() {
  const mnemonic = window.tempMnemonic;
  if (!mnemonic) return;

  // Generate wallet from mnemonic
  const seedHex = mnemonicToSeed(mnemonic);

  // Create keypair using elliptic
  const EC = elliptic.ec;
  const ec = new EC("secp256k1");
  const keyPair = ec.keyFromPrivate(seedHex);

  const privateKey = keyPair.getPrivate("hex");
  // Use encode('hex') which should produce uncompressed format with 04 prefix
  const publicKeyPoint = keyPair.getPublic();
  const publicKey = publicKeyPoint.encode("hex");

  console.log("=== Wallet Created ===");
  console.log("Public Key:", publicKey);
  console.log("Public Key Length:", publicKey.length);
  console.log("First 2 chars:", publicKey.substring(0, 2));

  // Save wallet
  currentWallet = {
    mnemonic: mnemonic,
    privateKey: privateKey,
    publicKey: publicKey,
    address: publicKey,
  };

  localStorage.setItem("shrimpchain_wallet", JSON.stringify(currentWallet));

  hideCreateWallet();
  showDashboard();
}

// Show Import Wallet Modal
function showImportWallet() {
  document.getElementById("import-modal").classList.remove("hidden");
}

// Hide Import Wallet Modal
function hideImportWallet() {
  document.getElementById("import-modal").classList.add("hidden");
  document.getElementById("mnemonic-input").value = "";
}

// Confirm Import Wallet
function confirmImportWallet() {
  const mnemonic = document.getElementById("mnemonic-input").value.trim();

  // Validate mnemonic (check if 12 words)
  const words = mnemonic.split(/\s+/);
  if (words.length !== 12) {
    alert("Invalid mnemonic phrase. Please enter exactly 12 words.");
    return;
  }

  // Validate each word is in wordlist
  for (const word of words) {
    if (!BIP39_WORDLIST.includes(word.toLowerCase())) {
      alert(`Invalid word: "${word}". Please check your mnemonic phrase.`);
      return;
    }
  }

  // Generate wallet from mnemonic
  const seedHex = mnemonicToSeed(mnemonic);

  // Create keypair using elliptic
  const EC = elliptic.ec;
  const ec = new EC("secp256k1");
  const keyPair = ec.keyFromPrivate(seedHex);

  const privateKey = keyPair.getPrivate("hex");
  // Use encode('hex') which should produce uncompressed format with 04 prefix
  const publicKeyPoint = keyPair.getPublic();
  const publicKey = publicKeyPoint.encode("hex");

  // Save wallet
  currentWallet = {
    mnemonic: mnemonic,
    privateKey: privateKey,
    publicKey: publicKey,
    address: publicKey,
  };

  localStorage.setItem("shrimpchain_wallet", JSON.stringify(currentWallet));

  hideImportWallet();
  showDashboard();
}

// Show Dashboard
async function showDashboard() {
  document.getElementById("welcome-screen").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");

  // Display address
  document.getElementById("wallet-address").textContent = currentWallet.address;

  // Load balance and nonce
  await refreshBalance();
}

// Refresh Balance
async function refreshBalance() {
  try {
    // Get balance (now returns both confirmed and pending)
    const balanceResponse = await fetch(
      `${API_URL}/balance?address=${currentWallet.address}`,
    );
    const balanceData = await balanceResponse.json();

    // Get nonce
    const nonceResponse = await fetch(
      `${API_URL}/nonce?address=${currentWallet.address}`,
    );
    const nonceData = await nonceResponse.json();

    // Update confirmed balance (spendable)
    document.getElementById("balance-display").textContent =
      balanceData.confirmed.toFixed(2);

    // Show pending balance if different from confirmed
    const pendingDisplay = document.getElementById("pending-display");
    if (pendingDisplay) {
      if (balanceData.pending !== balanceData.confirmed) {
        pendingDisplay.textContent = `⏳ Pending: ${balanceData.pending.toFixed(2)} SHRIMP (includes unconfirmed transactions)`;
        pendingDisplay.classList.remove("hidden");
      } else {
        pendingDisplay.classList.add("hidden");
      }
    }

    document.getElementById("nonce-display").textContent = nonceData.nonce;
  } catch (error) {
    console.error("Error fetching balance:", error);
    showStatus(
      "Error connecting to node. Please make sure the node is running.",
      "error",
    );
  }
}

// Copy Address
function copyAddress() {
  navigator.clipboard.writeText(currentWallet.address);
  showStatus("Address copied to clipboard!", "success");
}

// Send Transaction
async function sendTransaction() {
  const recipient = document.getElementById("recipient-input").value.trim();
  const amount = parseFloat(document.getElementById("amount-input").value);
  const fee = parseFloat(document.getElementById("fee-input").value);

  // Validation
  if (!recipient) {
    showStatus("Please enter recipient address", "error");
    return;
  }

  if (!amount || amount <= 0) {
    showStatus("Please enter a valid amount", "error");
    return;
  }

  if (!fee || fee < 0) {
    showStatus("Please enter a valid fee", "error");
    return;
  }

  try {
    // Get current balance and nonce (confirmed only)
    const balanceResponse = await fetch(
      `${API_URL}/balance?address=${currentWallet.address}`,
    );
    const balanceData = await balanceResponse.json();

    const nonceResponse = await fetch(
      `${API_URL}/nonce?address=${currentWallet.address}`,
    );
    const nonceData = await nonceResponse.json();

    const balance = balanceData.confirmed; // Use CONFIRMED balance only
    const nonce = nonceData.nonce;

    // Check sufficient CONFIRMED balance
    if (balance < amount + fee) {
      let errorMsg = `Insufficient confirmed balance. You have ${balance.toFixed(2)} SHRIMP confirmed.`;

      // If pending balance is higher, inform user
      if (balanceData.pending > balance) {
        errorMsg += ` (${balanceData.pending.toFixed(2)} SHRIMP pending - wait for confirmation)`;
      }

      showStatus(errorMsg, "error");
      return;
    }

    // Create transaction
    const outputMap = {
      [recipient]: amount,
      [currentWallet.address]: balance - amount - fee,
    };

    const transaction = {
      id: uuidv4(),
      outputMap: outputMap,
      input: {
        timestamp: Date.now(),
        amount: balance,
        address: currentWallet.address,
        nonce: nonce,
        signature: null,
      },
    };

    // Sign transaction
    const EC = elliptic.ec;
    const ec = new EC("secp256k1");
    const keyPair = ec.keyFromPrivate(currentWallet.privateKey);

    // IMPORTANT: Server validates signature against outputMap only
    // See Transaction.validTransaction() line 88: verifySignature({ publicKey: address, data: outputMap, signature })
    const hash = cryptoHash(transaction.outputMap);
    const signature = keyPair.sign(hash);
    transaction.input.signature = signature.toDER("hex");

    // Debug logging
    console.log("=== Transaction Debug ===");
    console.log("Public Key:", currentWallet.publicKey);
    console.log("Public Key Length:", currentWallet.publicKey.length);
    console.log("Address:", transaction.input.address);
    console.log("OutputMap:", transaction.outputMap);
    console.log("Hash:", hash);
    console.log("Signature:", transaction.input.signature);
    console.log("Transaction:", JSON.stringify(transaction, null, 2));

    // Send to API
    showStatus("Sending transaction...", "info");

    const response = await fetch(`${API_URL}/transact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transaction }),
    });

    const result = await response.json();

    if (result.type === "success") {
      showStatus("Transaction sent successfully! 🎉", "success");

      // Clear form
      document.getElementById("recipient-input").value = "";
      document.getElementById("amount-input").value = "";
      document.getElementById("fee-input").value = "1";

      // Refresh balance after a delay
      setTimeout(() => refreshBalance(), 2000);
    } else {
      showStatus(`Transaction failed: ${result.message}`, "error");
    }
  } catch (error) {
    console.error("Error sending transaction:", error);
    showStatus("Error sending transaction. Please try again.", "error");
  }
}

// Show Status Message
function showStatus(message, type) {
  const statusDiv = document.getElementById("tx-status");
  statusDiv.classList.remove("hidden");

  let bgColor, borderColor, textColor, icon;

  if (type === "success") {
    bgColor = "bg-green-50";
    borderColor = "border-green-400";
    textColor = "text-green-700";
    icon = "✓";
  } else if (type === "error") {
    bgColor = "bg-red-50";
    borderColor = "border-red-400";
    textColor = "text-red-700";
    icon = "✗";
  } else {
    bgColor = "bg-blue-50";
    borderColor = "border-blue-400";
    textColor = "text-blue-700";
    icon = "ℹ";
  }

  statusDiv.innerHTML = `
    <div class="${bgColor} border-l-4 ${borderColor} p-4 rounded-lg">
      <div class="flex items-center">
        <span class="text-2xl mr-3">${icon}</span>
        <p class="${textColor} font-semibold">${message}</p>
      </div>
    </div>
  `;

  // Auto-hide after 5 seconds
  setTimeout(() => {
    statusDiv.classList.add("hidden");
  }, 5000);
}

// Logout
function logout() {
  if (
    confirm(
      "Are you sure you want to logout? Make sure you have saved your mnemonic phrase!",
    )
  ) {
    localStorage.removeItem("shrimpchain_wallet");
    currentWallet = null;

    document.getElementById("dashboard").classList.add("hidden");
    document.getElementById("welcome-screen").classList.remove("hidden");
  }
}
