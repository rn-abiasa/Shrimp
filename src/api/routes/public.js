import express from "express";
import Transaction from "../../blockchain/transaction.js";
import Wallet from "../../wallet/index.js";
import {
  MINING_REWARD,
  HALVING_RATE,
  UNIT_MULTIPLIER,
  MINING_REWARD_INPUT,
  toBaseUnits,
  fromBaseUnits,
} from "../../config.js";
import GlobalState from "../../store/state.js";

export default function createPublicRoutes({
  blockchain,
  transactionPool,
  wallet,
  p2pServer,
  miner,
}) {
  const router = express.Router();

  // GET /blocks - Full Chain
  router.get("/blocks", (req, res) => {
    res.json(blockchain.chain);
  });

  // GET /height - Block Height
  router.get("/height", (req, res) => {
    res.json({ height: blockchain.chain.length });
  });

  // GET /balance - Account Balance
  router.get("/balance", (req, res) => {
    // Use address from query or default to wallet address
    const address = req.query.address || wallet.publicKey;

    // Get ACCOUNT State (Confirmed)
    const confirmed = Wallet.getAccountState({
      chain: blockchain.chain,
      address: address,
      state: blockchain.state,
    });

    // Get PENDING State (Projected)
    const pending = Wallet.getPendingState({
      chain: blockchain.chain,
      address: address,
      transactionPool: transactionPool,
      state: blockchain.state,
    });

    // Return raw base units (stringified BigInt)
    // Frontend is responsible for formatting (divide by 10^8)
    res.json({
      balance: confirmed.balance, // Committed balance
      pendingBalance: pending.balance, // Available for spending
      confirmed: confirmed.balance,
      pending: pending.balance,
      nonce: pending.nonce, // Next non-conflicting nonce
      address,
    });
  });

  // GET /public-key - Wallet Public Key
  router.get("/public-key", (req, res) => {
    res.json({ publicKey: wallet.publicKey });
  });

  // GET /nonce - Get Next Nonce
  router.get("/nonce", (req, res) => {
    try {
      const { address } = req.query;

      if (!address) {
        return res.status(400).json({ error: "Address parameter required" });
      }

      // Use PENDING state for next nonce calculation
      const pending = Wallet.getPendingState({
        chain: blockchain.chain,
        address: address,
        transactionPool: transactionPool,
        state: blockchain.state,
      });

      const confirmed = Wallet.getAccountState({
        chain: blockchain.chain,
        address: address,
        state: blockchain.state,
      });

      res.json({
        nonce: pending.nonce, // Next valid nonce for new transaction
        balance: confirmed.balance, // Committed balance (raw base units)
        confirmed: confirmed.balance,
        pending: pending.balance, // Available balance (raw base units)
        address,
      });
    } catch (e) {
      console.error("Error in /nonce:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /transactions - Mempool Transactions
  router.get("/transactions", (req, res) => {
    res.json(transactionPool.transactionMap);
  });

  // POST /transact - Create or Submit Transaction
  router.post("/transact", (req, res) => {
    const { recipient, amount, fee, transaction, type, data } = req.body;

    if (transaction) {
      // Rehydrate transaction from JSON to restore BigInts
      const tx = Transaction.fromJSON(transaction);

      // 1. Validate the incoming signed transaction
      if (!Transaction.validTransaction(tx)) {
        return res.status(400).json({
          type: "error",
          message: "Invalid transaction signature or structure",
        });
      }

      // Check if transaction is valid against current state (Account Model)
      const pendingState = Wallet.getPendingState({
        chain: blockchain.chain,
        address: tx.input.address,
        transactionPool: transactionPool,
        state: blockchain.state,
      });

      // Strict Nonce Check
      if (tx.input.nonce !== pendingState.nonce) {
        // ... (Nonce check logic same as before)
        if (
          transactionPool.existingTransaction({
            inputAddress: tx.input.address,
            nonce: tx.input.nonce,
          })
        ) {
          return res.status(400).json({
            type: "error",
            message: "Transaction with this nonce already exists in pool",
          });
        }
        return res.status(400).json({
          type: "error",
          message: `Invalid nonce. Expected: ${pendingState.nonce}, Got: ${tx.input.nonce}`,
        });
      }

      // Strict Balance Check
      // Input Amount (amount + fee) must be <= Pending Balance
      if (tx.input.amount > pendingState.balance) {
        return res.status(400).json({
          type: "error",
          message: `Insufficient funds. Available: ${pendingState.balance}, Needed: ${tx.input.amount}`,
        });
      }

      // 2. Add to pool and broadcast
      transactionPool.setTransaction(tx);
      p2pServer.broadcastTransaction(tx);

      // Auto-mine check
      if (miner.isAutoMining) {
        miner.mine();
      }

      return res.json({ type: "success", transaction: tx, status: "pending" });
    }

    // Legacy/Server-side signing flow
    // In Account Model, we should always create a NEW transaction with the next nonce.
    // We do NOT update existing transactions in the mempool (UTXO style aggregation),
    // because that breaks nonce sequencing and strict type handling (e.g. Contract vs Transfer).

    let localTransaction;
    try {
      localTransaction = wallet.createTransaction({
        recipient,
        amount: toBaseUnits(amount),
        fee: fee ? toBaseUnits(fee) : 0n,
        chain: blockchain.chain,
        transactionPool,
        type,
        data,
      });
    } catch (error) {
      return res.status(400).json({ type: "error", message: error.message });
    }

    transactionPool.setTransaction(localTransaction);
    p2pServer.broadcastTransaction(localTransaction);

    // Auto-mine check
    if (miner.isAutoMining) {
      miner.mine();
    }

    res.json({
      type: "success",
      transaction: localTransaction,
      status: "pending",
    });
  });

  // ============ EXPLORER API ENDPOINTS ============

  // Helper function to calculate circulating supply
  function calculateCirculatingSupply(height) {
    let supply = 0n;
    let currentHeight = 1; // Start from 1 (Skip Genesis)
    let halvingCount = 0;

    // We need to calculate how many blocks were mined in each halving era
    // But logic is simpler: iterate until we reach 'height'
    // Actually, 'height' is chain length. Mined blocks = height - 1.

    // Safety check
    if (height <= 1) return 0n;

    let remainingBlocks = height - 1;

    while (remainingBlocks > 0) {
      // Blocks for this halving amount
      const nextHalvingIndex = (halvingCount + 1) * HALVING_RATE;

      // Calculate blocks in this cycle relative to current total processed
      // It's tricky with the loop.
      // Simpler approach:

      const currentReward = MINING_REWARD / 2n ** BigInt(halvingCount);
      if (currentReward === 0n) break; // No more rewards

      // How many blocks in this era?
      // Era 0: 0 to 9999.
      // But we start at 1. So Era 0 has 9999 blocks (1 to 9999).
      // This loop logic needs to be robust.

      // Let's use ranges.
      const eraStart = halvingCount * HALVING_RATE;
      const eraEnd = (halvingCount + 1) * HALVING_RATE;

      // Overlap of [1, height-1] and [eraStart, eraEnd]
      const rangeStart = Math.max(1, eraStart);
      const rangeEnd = Math.min(height, eraEnd); // height is exclusive/inclusive?
      // Block indices are 0 to height-1.
      // Mined blocks are indices 1 to height-1.

      if (rangeStart < rangeEnd) {
        const count = BigInt(rangeEnd - rangeStart);
        supply += count * currentReward;
      }

      if (height <= eraEnd) break;
      halvingCount++;
    }

    return supply;
  }

  // GET /holders - Get all token holders with balances and tiers
  router.get("/holders", (req, res) => {
    try {
      const holdersMap = new Map();
      const accounts = blockchain.state.accountState;

      for (const [address, account] of Object.entries(accounts)) {
        if (account.balance > 0n) {
          holdersMap.set(address, account.balance);
        }
      }

      // Helper function to determine tier
      function getTier(balance) {
        // balance is BigInt base units. Convert to main unit number for tiering.
        const balanceNum = parseFloat(fromBaseUnits(balance));
        if (balanceNum >= 50000)
          return { name: "king", icon: "👑", color: "gold" };
        if (balanceNum >= 10000)
          return { name: "miner", icon: "⛏️", color: "orange" };
        if (balanceNum >= 1000)
          return { name: "whale", icon: "🐋", color: "purple" };
        if (balanceNum >= 500)
          return { name: "shark", icon: "🦈", color: "teal" };
        if (balanceNum >= 100)
          return { name: "fish", icon: "🐟", color: "blue" };
        return { name: "shrimp", icon: "🦐", color: "gray" };
      }

      // Convert to array and add tier info
      const holders = Array.from(holdersMap.entries())
        .filter(([address, balance]) => balance > 0n) // Only include addresses with positive balance
        .map(([address, balance]) => {
          const tier = getTier(balance);
          return {
            address,
            balance: parseFloat(fromBaseUnits(balance)), // Return Number for frontend display
            tier: tier.name,
            tierIcon: tier.icon,
            tierColor: tier.color,
          };
        })
        .sort((a, b) => b.balance - a.balance); // Sort by balance descending

      // Calculate total supply
      const totalSupplyBigInt = Array.from(holdersMap.values()).reduce(
        (sum, bal) => sum + bal,
        0n,
      );
      const totalSupply = parseFloat(fromBaseUnits(totalSupplyBigInt));

      // Calculate distribution by tier
      const distribution = {
        shrimp: 0,
        fish: 0,
        shark: 0,
        whale: 0,
        miner: 0,
        king: 0,
      };

      holders.forEach((holder) => {
        distribution[holder.tier]++;
      });

      // Add percentage of total supply to each holder
      const holdersWithPercentage = holders.map((holder) => ({
        ...holder,
        percentage:
          totalSupply > 0
            ? parseFloat(((holder.balance / totalSupply) * 100).toFixed(4))
            : 0,
      }));

      res.json({
        totalHolders: holders.length,
        totalSupply: parseFloat(totalSupply.toFixed(6)),
        distribution,
        holders: holdersWithPercentage,
      });
    } catch (error) {
      console.error("Error in /holders:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/explorer/stats - Network statistics
  router.get("/api/explorer/stats", (req, res) => {
    try {
      const height = blockchain.chain.length;

      // Calculate total transactions
      let totalTransactions = 0;
      for (const block of blockchain.chain) {
        totalTransactions += block.data.filter(
          (tx) => tx.input.address !== MINING_REWARD_INPUT.address,
        ).length;
      }

      // Calculate supply metrics (All in Base Units - BigInt)
      const circulatingSupply = calculateCirculatingSupply(height);

      // Max Supply = Sum of all eras
      // Geometric series? Or just standard approximation:
      // Reward * Rate * 2
      const maxSupply = MINING_REWARD * BigInt(HALVING_RATE) * 2n;

      const unminedSupply = maxSupply - circulatingSupply;

      res.json({
        height,
        totalTransactions,
        maxSupply, // BigInt will be stringified
        circulatingSupply, // BigInt will be stringified
        unminedSupply, // BigInt will be stringified
        mempoolSize: Object.keys(transactionPool.transactionMap).length,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/explorer/blocks - Paginated blocks
  router.get("/api/explorer/blocks", (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const offset = parseInt(req.query.offset) || 0;

      const blocks = blockchain.chain
        .slice()
        .reverse()
        .slice(offset, offset + limit)
        .map((block) => ({
          index: block.index,
          hash: block.hash,
          timestamp: block.timestamp,
          transactionCount: block.data.length,
          miner: block.data.find(
            (tx) => tx.input.address === MINING_REWARD_INPUT.address,
          )?.outputMap
            ? Object.keys(
                block.data.find(
                  (tx) => tx.input.address === MINING_REWARD_INPUT.address,
                ).outputMap,
              )[0]
            : null,
          difficulty: block.difficulty,
          nonce: block.nonce,
          lastHash: block.lastHash,
        }));

      res.json({
        blocks,
        total: blockchain.chain.length,
        limit,
        offset,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/explorer/block/:indexOrHash - Single block details
  router.get("/api/explorer/block/:indexOrHash", (req, res) => {
    try {
      const { indexOrHash } = req.params;
      let block;

      // Try to find by index first
      if (!isNaN(indexOrHash)) {
        const index = parseInt(indexOrHash);
        block = blockchain.chain[index];
      } else {
        // Find by hash
        block = blockchain.chain.find((b) => b.hash === indexOrHash);
      }

      if (!block) {
        return res.status(404).json({ error: "Block not found" });
      }

      res.json(block);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/explorer/transactions - Paginated transactions
  router.get("/api/explorer/transactions", (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const offset = parseInt(req.query.offset) || 0;

      // Collect all transactions from all blocks
      const allTransactions = [];
      for (let i = blockchain.chain.length - 1; i >= 0; i--) {
        const block = blockchain.chain[i];
        for (const tx of block.data) {
          let method = "Chain Transfer";
          if (tx.input.address === MINING_REWARD_INPUT.address) {
            method = "Mining Reward";
          } else if (tx.type === "CALL_CONTRACT") {
            method = "Call Contract";
          } else if (tx.type === "CREATE_CONTRACT") {
            method = "Create Contract";
          }

          allTransactions.push({
            ...tx,
            blockIndex: block.index,
            blockHash: block.hash,
            timestamp: block.timestamp,
            status: "confirmed",
            method,
          });
        }
      }

      const transactions = allTransactions.slice(offset, offset + limit);

      res.json({
        transactions,
        total: allTransactions.length,
        limit,
        offset,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/explorer/mempool - Paginated mempool transactions
  router.get("/api/explorer/mempool", (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const offset = parseInt(req.query.offset) || 0;

      const allTransactions = Object.values(transactionPool.transactionMap).map(
        (tx) => ({
          ...tx,
          status: "pending",
          timestamp: tx.input.timestamp, // Ensure timestamp is available
        }),
      );

      // Sort by timestamp descending (newest first)
      allTransactions.sort((a, b) => b.timestamp - a.timestamp);

      const transactions = allTransactions.slice(offset, offset + limit);

      res.json({
        transactions,
        total: allTransactions.length,
        limit,
        offset,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/explorer/transaction/:hash - Single transaction details
  router.get("/api/explorer/transaction/:hash", (req, res) => {
    try {
      const { hash } = req.params;

      // Search in blockchain
      for (const block of blockchain.chain) {
        const tx = block.data.find((t) => t.id === hash);
        if (tx) {
          return res.json({
            ...tx,
            blockIndex: block.index,
            blockHash: block.hash,
            timestamp: block.timestamp,
            status: "confirmed",
          });
        }
      }

      // Search in mempool
      const mempoolTx = transactionPool.transactionMap[hash];
      if (mempoolTx) {
        return res.json({
          ...mempoolTx,
          status: "pending",
        });
      }

      res.status(404).json({ error: "Transaction not found" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/explorer/address/:address - Address details
  router.get("/api/explorer/address/:address", (req, res) => {
    try {
      const { address } = req.params;

      const result = Wallet.calculateBalance({
        chain: blockchain.chain,
        address: address,
        transactionPool,
        state: blockchain.state,
      });
      const balance = result.balance;

      // Find all transactions involving this address
      const transactions = [];
      for (const block of blockchain.chain) {
        for (const tx of block.data) {
          if (
            tx.input.address === address ||
            Object.keys(tx.outputMap).includes(address)
          ) {
            transactions.push({
              ...tx,
              blockIndex: block.index,
              blockHash: block.hash,
              timestamp: block.timestamp,
              status: "confirmed",
            });
          }
        }
      }

      // Check mempool
      for (const txId in transactionPool.transactionMap) {
        const tx = transactionPool.transactionMap[txId];
        if (
          tx.input.address === address ||
          Object.keys(tx.outputMap).includes(address)
        ) {
          transactions.push({
            ...tx,
            status: "pending",
          });
        }
      }

      // Find all token balances for this address
      const tokens = [];
      const accounts = blockchain.state.accountState;
      for (const [contractAddress, account] of Object.entries(accounts)) {
        if (
          account.storage &&
          account.storage.balances &&
          account.storage.balances[address] !== undefined
        ) {
          tokens.push({
            contractAddress,
            symbol: account.storage.symbol || "UNKNOWN",
            name: account.storage.name || "Unknown Token",
            balance: account.storage.balances[address].toString(),
          });
        }
      }

      res.json({
        address,
        balance,
        nonce: result.nonce || 0,
        tokens,
        transactions: transactions.reverse(), // Newest first
        transactionCount: transactions.length,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/explorer/contracts - List all smart contracts
  router.get("/api/explorer/contracts", (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const offset = parseInt(req.query.offset) || 0;

      // Access global state directly to find contracts
      const accounts = blockchain.state.accountState;
      const contracts = [];

      for (const [address, account] of Object.entries(accounts)) {
        if (account.code) {
          const metadata = {};
          if (account.storage) {
            if (account.storage.symbol)
              metadata.symbol = account.storage.symbol;
            if (account.storage.name) metadata.name = account.storage.name;
            if (account.storage.shrimpBalance !== undefined)
              metadata.shrimpBalance = account.storage.shrimpBalance.toString();
            if (account.storage.tokenBalance !== undefined)
              metadata.tokenBalance = account.storage.tokenBalance.toString();
            if (account.storage.tokenAddress)
              metadata.tokenAddress = account.storage.tokenAddress;
            if (account.storage.balances) {
              // Return holders count instead of full map
              metadata.holdersCount = Object.keys(
                account.storage.balances,
              ).length;
            }
          }

          contracts.push({
            address,
            balance: account.balance.toString(), // Convert BigInt
            nonce: account.nonce,
            codeLength: account.code.length,
            storageSize: Object.keys(account.storage || {}).length,
            metadata,
          });
        }
      }

      // Sort by balance desc (rich list) or maybe creation time?
      // State doesn't track creation time.
      // Let's sort by balance for now.
      contracts.sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));

      const paginated = contracts.slice(offset, offset + limit);

      res.json({
        contracts: paginated,
        total: contracts.length,
        limit,
        offset,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/explorer/contract/:address - Contract Details (Code & Storage)
  router.get("/api/explorer/contract/:address", (req, res) => {
    try {
      const { address } = req.params;
      const accountData = blockchain.state.getAccount(address);

      if (!accountData || !accountData.code) {
        return res.status(404).json({ error: "Smart Contract not found" });
      }

      // Format storage values (handle BigInts if any)
      const formattedStorage = {};
      if (accountData.storage) {
        for (const [key, value] of Object.entries(accountData.storage)) {
          formattedStorage[key] =
            typeof value === "bigint" ? value.toString() : value;
        }
      }

      res.json({
        address,
        balance: accountData.balance.toString(),
        nonce: accountData.nonce,
        code: accountData.code,
        storage: formattedStorage,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/explorer/contract/:address/holders - Contract specific holders (if it's a token)
  router.get("/api/explorer/contract/:address/holders", (req, res) => {
    try {
      const { address } = req.params;
      const accountData = blockchain.state.getAccount(address);

      if (!accountData || !accountData.code) {
        return res.status(404).json({ error: "Smart Contract not found" });
      }

      // Check if it's a token (has 'balances' in storage)
      const balances = accountData.storage?.balances;
      if (!balances || typeof balances !== "object") {
        return res.json({
          holders: [],
          isToken: false,
          totalHolders: 0,
        });
      }

      // Format holders
      const holders = Object.entries(balances)
        .map(([addr, balance]) => ({
          address: addr,
          balance: typeof balance === "bigint" ? balance.toString() : balance,
        }))
        .filter((h) => BigInt(h.balance) > 0n)
        .sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));

      const totalHolders = holders.length;
      const totalSupply = holders.reduce(
        (sum, h) => sum + BigInt(h.balance),
        0n,
      );

      res.json({
        holders,
        isToken: true,
        totalHolders,
        totalSupply: totalSupply.toString(),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/explorer/contract/:address/transactions - Transactions involving this contract
  router.get("/api/explorer/contract/:address/transactions", (req, res) => {
    try {
      const { address } = req.params;
      const transactions = [];

      // Scan blockchain for transactions involving this address
      for (let i = blockchain.chain.length - 1; i >= 0; i--) {
        const block = blockchain.chain[i];
        for (const tx of block.data) {
          const isRecipient = Object.keys(tx.outputMap).includes(address);
          const isSender = tx.input.address === address;
          const isMentionedInArgs =
            tx.data?.args &&
            Array.isArray(tx.data.args) &&
            tx.data.args.includes(address);

          if (isSender || isRecipient || isMentionedInArgs) {
            transactions.push({
              ...tx,
              blockIndex: block.index,
              blockHash: block.hash,
              timestamp: block.timestamp,
              status: "confirmed",
            });
          }
        }
      }

      res.json({
        transactions,
        total: transactions.length,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/explorer/search?q=...
  router.get("/api/explorer/search", (req, res) => {
    try {
      const { q } = req.query;
      if (!q) return res.status(400).json({ error: "Query required" });

      // 1. Check if it's a block index
      if (!isNaN(q)) {
        const index = parseInt(q);
        if (blockchain.chain[index]) {
          return res.json({ type: "block", id: index });
        }
      }

      // 2. Check if it's a block hash
      const blockByHash = blockchain.chain.find((b) => b.hash === q);
      if (blockByHash) {
        return res.json({ type: "block", id: blockByHash.index });
      }

      // 3. Check if it's a transaction hash
      for (const block of blockchain.chain) {
        const tx = block.data.find((t) => t.id === q);
        if (tx) {
          return res.json({ type: "transaction", id: q });
        }
      }

      // 4. Check if it's an address (Contract or Wallet)
      const account = blockchain.state.getAccount(q);
      if (account) {
        if (account.code) {
          return res.json({ type: "contract", id: q });
        }
        return res.json({ type: "address", id: q });
      }

      // 5. Fallback: Check if it's a valid address format (130 char hex for ECC public keys)
      if (q.length === 130 && /^[0-9a-fA-F]+$/.test(q)) {
        return res.json({ type: "address", id: q });
      }

      res.status(404).json({ error: "Not found" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /smart-contract/storage/:address - Legacy/Direct Storage Access
  router.get("/smart-contract/storage/:address", (req, res) => {
    try {
      const { address } = req.params;
      const key = req.query.key; // Optional key to fetch specific storage item

      const account = Wallet.getAccountState({
        chain: blockchain.chain,
        address: address,
      });

      // The getAccountState in Wallet returns { balance, nonce }.
      // It DOES NOT return the full account object with 'storage'.
      // createPublicRoutes has access to 'blockchain'.
      // I should use blockchain.state.getAccount(address).

      // Wait, blockchain.state is available?
      // YES, blockchain instance has .state (GlobalState).

      const accountData = blockchain.state.getAccount(address);

      if (!accountData || !accountData.code) {
        return res.status(404).json({ error: "Smart Contract not found" });
      }

      if (key) {
        return res.json({ [key]: accountData.storage[key] });
      }

      res.json(accountData.storage || {});
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/explorer/token/:address/history - Sampled price history
  router.get("/api/explorer/token/:address/history", (req, res) => {
    try {
      const { address } = req.params;
      const { range = "1D" } = req.query;
      const history = [];
      const height = blockchain.chain.length;

      const accounts = blockchain.state.accountState;
      let poolAddress = null;

      // 1. Check if the address provided is already a pool
      const inputAccount = blockchain.state.getAccount(address);
      if (
        inputAccount &&
        inputAccount.storage &&
        inputAccount.storage.tokenAddress &&
        inputAccount.storage.shrimpBalance !== undefined
      ) {
        poolAddress = address;
      }

      // 2. Otherwise search for a pool that has this token
      if (!poolAddress) {
        for (const [addr, account] of Object.entries(accounts)) {
          if (
            account.storage &&
            account.storage.tokenAddress?.toLowerCase() ===
              address.toLowerCase() &&
            account.storage.shrimpBalance !== undefined
          ) {
            poolAddress = addr;
            break;
          }
        }
      }

      if (!poolAddress) {
        return res.json({ history: [] });
      }

      // 3. Determine lookback based on range
      const now = Date.now();
      let lookbackMs = 24 * 3600 * 1000; // Default 1D
      if (range === "1H") lookbackMs = 3600 * 1000;
      if (range === "1D") lookbackMs = 24 * 3600 * 1000;
      if (range === "1W") lookbackMs = 7 * 24 * 3600 * 1000;
      if (range === "1M") lookbackMs = 30 * 24 * 3600 * 1000;
      if (range === "ALL") lookbackMs = now; // Forever

      const sampleCount = 100; // Increased from 20 for better resolution
      const snapshotHeights = [];

      // Find blocks within timeframe
      const relevantBlocks = [];
      for (let i = height - 1; i >= 0; i--) {
        const block = blockchain.chain[i];
        if (range !== "ALL" && now - block.timestamp > lookbackMs) break;
        relevantBlocks.push(i);
      }
      relevantBlocks.reverse();

      if (relevantBlocks.length === 0) {
        // Fallback: at least show the latest block if nothing in range
        relevantBlocks.push(height - 1);
      }

      // Sample from relevant blocks
      const step = Math.max(1, Math.floor(relevantBlocks.length / sampleCount));
      const sampleHeights = [];
      for (let i = 0; i < relevantBlocks.length; i += step) {
        sampleHeights.push(relevantBlocks[i]);
      }
      // Ensure latest is included
      if (
        sampleHeights[sampleHeights.length - 1] !==
        relevantBlocks[relevantBlocks.length - 1]
      ) {
        sampleHeights.push(relevantBlocks[relevantBlocks.length - 1]);
      }

      let currentState = new GlobalState();
      let sampleIndex = 0;
      let poolCreatedHeight = -1;
      let liquidityAddedHeight = -1;

      const targetHeight = sampleHeights[sampleHeights.length - 1];

      for (let i = 0; i <= targetHeight; i++) {
        const block = blockchain.chain[i];
        if (!block) break;

        blockchain.executeBlock({
          block,
          state: currentState,
          options: { silent: true },
        });

        const poolAccount = currentState.getAccount(poolAddress);
        const isPoolInitialized =
          poolAccount &&
          poolAccount.storage &&
          poolAccount.storage.tokenAddress;
        const hasLiquidity =
          isPoolInitialized &&
          BigInt(poolAccount.storage.tokenBalance || 0) > 0n;

        if (isPoolInitialized) {
          if (poolCreatedHeight === -1) poolCreatedHeight = i;
          if (hasLiquidity && liquidityAddedHeight === -1)
            liquidityAddedHeight = i;

          // Always include:
          // 1. The very first block the pool appeared
          // 2. The block where liquidity was first added (Price start)
          // 3. Sampled heights
          // 4. The absolute latest block
          const isAtSampleHeight = sampleHeights[sampleIndex] === i;
          const isInitialBlock = poolCreatedHeight === i;
          const isLiquidityBlock = liquidityAddedHeight === i;
          const isLatestBlock = i === height - 1;

          if (
            isAtSampleHeight ||
            isInitialBlock ||
            isLiquidityBlock ||
            isLatestBlock
          ) {
            const sBal = poolAccount.balance;
            const tBal = BigInt(poolAccount.storage.tokenBalance || 0);

            if (tBal > 0n) {
              const price =
                Number((sBal * 1000000000000n) / tBal) / 1000000000000;

              // Avoid duplicates
              if (
                history.length === 0 ||
                history[history.length - 1].timestamp !== block.timestamp
              ) {
                history.push({
                  time: new Date(block.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  }),
                  value: price,
                  timestamp: block.timestamp,
                });
              }
            }
            if (isAtSampleHeight) sampleIndex++;
          }
        } else {
          if (sampleHeights[sampleIndex] === i) sampleIndex++;
        }
      }

      res.json({ history });
    } catch (error) {
      console.error("Error in /history:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
