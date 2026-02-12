import Blockchain from "../src/blockchain/chain.js";
import Wallet from "../src/wallet/index.js";
import Transaction from "../src/blockchain/transaction.js";
import Block from "../src/blockchain/block.js";
import { MINING_REWARD_INPUT } from "../src/config.js";

// Mock Mining for Speed
Block.mineBlock = ({ lastBlock, data }) => {
  const timestamp = Date.now();
  return new Block({
    timestamp,
    lastHash: lastBlock.hash,
    hash: `mock-hash-${timestamp}`,
    data,
    nonce: 0,
    difficulty: 1,
    index: lastBlock.index + 1,
  });
};

async function runTest() {
  console.log("🚀 Starting Smart Contract Verification...");

  // 1. Setup Blockchain & Wallets
  const blockchain = new Blockchain();
  // We need to bypass P2P and storage for this test, or just use them naturally.
  // We'll mock storage to avoid messing up real chain data?
  // Or just use a temporary DB path?
  // For simplicity, we'll just run it. It might write to 'data' folder.
  // But since we didn't init() logic to override path, it uses default.
  // Warning: This might corrupt user's local chain if they have one running?
  // The user likely has a chain running.
  // I should probably warn or use a mock storage.

  // Let's just mock storage methods on the instance.
  blockchain.storage = {
    loadChain: async () => [],
    saveChain: async () => {},
    clear: async () => {},
  };

  // Re-init state to be sure
  blockchain.rebuildState();

  const deployer = new Wallet("deployer");
  // Ensure we have keys
  if (!deployer.keyPair) {
    deployer.create();
  }

  deployer.balance = 1000n; // Give some initial funds (cheating for test)

  // Update GlobalState with initial funds so validation passes
  blockchain.state.putAccount({
    address: deployer.publicKey,
    accountData: { balance: 1000n, nonce: 0, code: null, storage: {} },
  });

  console.log(
    "👤 Deployer Initial Balance:",
    blockchain.state.getBalance(deployer.publicKey),
  );

  // 2. Define Smart Contract Code
  const contractCode = `
    class SmartContract {
      init() {
        this.state.count = 0;
        this.state.owner = this.sender;
      }

      increment(val) {
        this.state.count += val;
        console.log("Count is now:", this.state.count);
      }
    }
  `;

  // 3. Create Deploy Transaction
  console.log("📜 Deploying Smart Contract...");
  const deployTx = Transaction.createContract({
    senderWallet: deployer,
    code: contractCode,
    fee: 10n,
    nonce: 0,
  });

  // 4. Mine Block with Deploy Tx
  blockchain.addBlock({ data: [deployTx] });
  console.log("⛏️  Block mined with deployment.");

  // 5. Find Contract Address
  // In our implementation, we don't return the address in outputMap exactly?
  // Wait, `createContract` in `transaction.js` sets `recipient: null`.
  // `executeBlock` in `chain.js` calls `sc.createContract(...)`.
  // BUT `Transaction` creation didn't calculate the address.
  // `sc.createContract` calculates it.
  // How does the USER know the address?
  // Usually it is deterministic. hash(sender + nonce).
  // I should probably log it or calculate it here using same logic.

  // Logic from contract.js: const contractAddress = cryptoHash(sender, senderNonce, code);
  // Replicating logic relies on import.
  // Let's inspect the state to find the contract.

  const allAccounts = Object.keys(blockchain.state.accountState);
  const contractAddress = allAccounts.find(
    (addr) => addr !== deployer.publicKey,
  );

  // Verification Check
  const { cryptoHash } = await import("../src/crypto/index.js");
  const expectedAddress = cryptoHash(deployer.publicKey, 0, contractCode);
  if (contractAddress && contractAddress !== expectedAddress) {
    console.error(
      `❌ Address Mismatch! Expected: ${expectedAddress}, Got: ${contractAddress}`,
    );
    process.exit(1);
  }

  if (!contractAddress) {
    console.error("❌ Contract deployment failed. No new account found.");
    process.exit(1);
  }

  console.log("✅ Contract deployed at:", contractAddress);
  console.log(
    "   Initial Storage:",
    blockchain.state.getAccount(contractAddress).storage,
  );

  // 6. Call Contract (Increment)
  console.log("📞 Calling 'increment(5)'...");
  const callTx = Transaction.callContract({
    senderWallet: deployer,
    contractAddress,
    func: "increment",
    args: [5],
    fee: 10n,
    nonce: 1,
  });

  // 7. Mine Block with Call Tx
  blockchain.addBlock({ data: [callTx] });
  console.log("⛏️  Block mined with contract call.");

  // 8. Verify State
  const storage = blockchain.state.getStorage(contractAddress, "count");
  console.log("📊 Final Storage Count:", storage);

  if (storage === 5) {
    console.log("✅ Verification SUCCESS!");
  } else {
    console.error("❌ Verification FAILED. Expected 5, got", storage);
    process.exit(1);
  }
}

runTest();
