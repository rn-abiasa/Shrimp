import Blockchain from "../src/blockchain/chain.js";
import Wallet from "../src/wallet/index.js";
import TransactionPool from "../src/blockchain/mempool.js";
import Transaction from "../src/blockchain/transaction.js";
import Miner from "../src/mining/miner.js";
import fs from "fs-extra";

const TEST_DB = process.env.DB_PATH || "./test_db_" + Date.now();

async function testAccountModel() {
  console.log(`🦐 Starting Account Model Test (DB: ${TEST_DB})...\n`);

  if (fs.existsSync(TEST_DB)) {
    await fs.remove(TEST_DB);
  }

  const blockchain = new Blockchain();
  await blockchain.init();

  if (blockchain.chain.length > 1) {
    console.log("Found existing chain, clearing...");
    await blockchain.storage.clear();
    blockchain.chain = [blockchain.chain[0]];
  }

  const wallet = new Wallet("test-wallet-" + Date.now());
  if (!wallet.publicKey) {
    console.log("Creating new test wallet...");
    wallet.create();
  }
  console.log(`Test Wallet: ${wallet.publicKey}`);

  const recipient = "recipient-address";
  const pool = new TransactionPool();
  pool.setBlockchain(blockchain);

  // Mock P2P server
  const mockP2p = {
    syncChains: () => {},
    broadcastTransaction: () => {},
    broadcastClearTransactions: () => {},
  };
  const miner = new Miner({
    blockchain,
    transactionPool: pool,
    wallet,
    p2pServer: mockP2p,
  });

  const waitForBlock = async (targetHeight) => {
    process.stdout.write(`Waiting for block height ${targetHeight}...`);
    let retries = 0;
    while (blockchain.chain.length < targetHeight && retries < 40) {
      await new Promise((r) => setTimeout(r, 250));
      process.stdout.write(".");
      retries++;
    }
    console.log(
      blockchain.chain.length >= targetHeight ? " Done." : " Timeout!",
    );
    // Small buffer to let miner finish cleanup
    await new Promise((r) => setTimeout(r, 100));
  };

  console.log("1. Mining some blocks to get rewards...");

  // Mine Block 1
  miner.mine();
  await waitForBlock(2);

  // Mine Block 2
  miner.mine();
  await waitForBlock(3);

  console.log(`Chain Length: ${blockchain.chain.length}`);

  // Check Account State
  const accountState = Wallet.getAccountState({
    chain: blockchain.chain,
    address: wallet.publicKey,
  });
  console.log(`Confirmed Balance: ${accountState.balance}`);
  console.log(`Confirmed Nonce: ${accountState.nonce}`);

  if (accountState.balance === 0n) {
    console.error("❌ Stats failed: No balance after mining.");
    process.exit(1);
  }

  // Check Pending State
  let pendingState = Wallet.getPendingState({
    chain: blockchain.chain,
    address: wallet.publicKey,
    transactionPool: pool,
  });
  console.log(`Pending Balance: ${pendingState.balance}`);
  console.log(`Next Nonce: ${pendingState.nonce}`);

  console.log("\n2. Creating Transaction 1 (Valid)...");
  const amount1 = 100n;
  const fee1 = 10n;

  const tx1 = wallet.createTransaction({
    recipient,
    amount: amount1,
    fee: fee1,
    chain: blockchain.chain,
    transactionPool: pool,
  });

  console.log(`TX1 Nonce: ${tx1.input.nonce}`);

  if (Transaction.validTransaction(tx1, pendingState)) {
    console.log("✅ TX1 Validated successfully.");
    pool.setTransaction(tx1);
  } else {
    console.error("❌ TX1 Validation Failed!");
  }

  pendingState = Wallet.getPendingState({
    chain: blockchain.chain,
    address: wallet.publicKey,
    transactionPool: pool,
  });
  console.log(
    `\nState after TX1: Balance=${pendingState.balance}, Nonce=${pendingState.nonce}`,
  );

  if (BigInt(pendingState.nonce) !== BigInt(accountState.nonce) + 1n) {
    console.error(
      `❌ Pending Nonce did not increment! Got ${pendingState.nonce}, Expected ${accountState.nonce + 1}`,
    );
  } else {
    console.log("✅ Pending Nonce incremented correctly.");
  }

  console.log("\n3. Testing Double Spend / Replay (Same Nonce)...");
  try {
    const txReplay = new Transaction({
      senderWallet: wallet,
      recipient,
      amount: amount1,
      fee: fee1,
      nonce: tx1.input.nonce,
      inputAmount: amount1 + fee1,
    });

    if (Transaction.validTransaction(txReplay, pendingState)) {
      console.error(
        "❌ Replay TX passed validation (Should fail nonce check)!",
      );
    } else {
      console.log("✅ Replay TX rejected correctly (Invalid Nonce).");
    }
  } catch (e) {
    console.log("Error creating replay tx", e.message);
  }

  console.log("\n4. Testing Sequential Nonce Gap...");
  const txFuture = new Transaction({
    senderWallet: wallet,
    recipient,
    amount: amount1,
    fee: fee1,
    nonce: pendingState.nonce + 5,
    inputAmount: amount1 + fee1,
  });

  if (Transaction.validTransaction(txFuture, pendingState)) {
    console.error(
      "❌ Future TX passed validation (Should fail strict nonce check)!",
    );
  } else {
    console.log("✅ Future TX rejected correctly.");
  }

  console.log("\n5. Testing Insufficient Balance...");
  try {
    const bigAmount = accountState.balance + 10000000n;
    wallet.createTransaction({
      recipient,
      amount: bigAmount,
      fee: fee1,
      chain: blockchain.chain,
      transactionPool: pool,
    });
    console.error(
      "❌ Oversize TX passed creation (Should fail balance check)!",
    );
  } catch (e) {
    console.log(`✅ Oversize TX rejected correctly: ${e.message}`);
  }

  if (fs.existsSync(TEST_DB)) {
    await fs.remove(TEST_DB);
  }

  console.log("\nTests Completed.");
  process.exit(0);
}

testAccountModel().catch((e) => console.error(e));
