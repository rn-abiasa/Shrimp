// GET /holders - Get all token holders with balances and tiers
app.get("/holders", (req, res) => {
  try {
    const holdersMap = new Map();

    // Calculate balances for all addresses
    for (let i = 1; i < blockchain.chain.length; i++) {
      const block = blockchain.chain[i];

      for (let transaction of block.data) {
        // Skip reward transactions for sender
        if (transaction.input.address === MINING_REWARD_INPUT.address) {
          // Add mining rewards to recipients
          for (const [address, amount] of Object.entries(
            transaction.outputMap,
          )) {
            const current = holdersMap.get(address) || 0;
            holdersMap.set(address, current + amount);
          }
          continue;
        }

        // Process regular transactions
        for (const [address, amount] of Object.entries(transaction.outputMap)) {
          holdersMap.set(address, amount);
        }
      }
    }

    // Helper function to determine tier
    function getTier(balance) {
      if (balance >= 50000) return { name: "king", icon: "👑", color: "gold" };
      if (balance >= 10000)
        return { name: "miner", icon: "⛏️", color: "orange" };
      if (balance >= 1000)
        return { name: "whale", icon: "🐋", color: "purple" };
      if (balance >= 500) return { name: "shark", icon: "🦈", color: "teal" };
      if (balance >= 100) return { name: "fish", icon: "🐟", color: "blue" };
      return { name: "shrimp", icon: "🦐", color: "gray" };
    }

    // Convert to array and add tier info
    const holders = Array.from(holdersMap.entries())
      .filter(([address, balance]) => balance > 0) // Only include addresses with positive balance
      .map(([address, balance]) => {
        const tier = getTier(balance);
        return {
          address,
          balance: parseFloat(balance.toFixed(6)),
          tier: tier.name,
          tierIcon: tier.icon,
          tierColor: tier.color,
        };
      })
      .sort((a, b) => b.balance - a.balance); // Sort by balance descending

    // Calculate total supply
    const totalSupply = holders.reduce(
      (sum, holder) => sum + holder.balance,
      0,
    );

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
      percentage: parseFloat(((holder.balance / totalSupply) * 100).toFixed(4)),
    }));

    res.json({
      totalHolders: holders.length,
      totalSupply: parseFloat(totalSupply.toFixed(6)),
      distribution,
      holders: holdersWithPercentage,
    });
  } catch (error) {
    console.error("Error fetching holders:", error);
    res.status(500).json({ error: error.message });
  }
});
