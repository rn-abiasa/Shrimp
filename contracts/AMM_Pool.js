class SmartContract {
  init() {
    this.state.shrimpBalance = 0n;
    this.state.tokenBalance = 0n;
    this.state.tokenAddress = null;
    this.state.symbol = "POOL-TKN";
    this.state.name = "AMM Pool Token";
    this.state.owner = this.sender;
    this.state.balances = {}; // Internal accounting for pooled tokens
  }

  // Set the token metadata for this pool
  setup(tokenAddress, symbol, name) {
    if (this.state.tokenAddress) throw new Error("Pool already setup");
    this.state.tokenAddress = tokenAddress;
    if (symbol) this.state.symbol = symbol;
    if (name) this.state.name = name;
  }

  // Swap NATIVE SHRIMP for Tokens
  swap(amountInString) {
    const amountIn = BigInt(amountInString);
    if (amountIn <= 0n) throw new Error("Amount must be positive");

    const shrimpReserve = BigInt(this.state.shrimpBalance || 0);
    const tokenReserve = BigInt(this.state.tokenBalance || 0);

    if (shrimpReserve === 0n || tokenReserve === 0n) {
      throw new Error("No liquidity in pool");
    }

    // x * y = k logic
    // dy = (y * dx) / (x + dx)
    const dy = (tokenReserve * amountIn) / (shrimpReserve + amountIn);

    // Apply 0.3% fee
    const amountOut = (dy * 997n) / 1000n;

    if (amountOut > tokenReserve) throw new Error("Not enough token liquidity");
    if (amountOut <= 0n) throw new Error("Swap amount too small");

    // Update reserves
    this.state.shrimpBalance = (shrimpReserve + amountIn).toString();
    this.state.tokenBalance = (tokenReserve - amountOut).toString();

    // Credit user's internal balance in the pool
    const currentBalance = BigInt(this.state.balances[this.sender] || 0);
    this.state.balances[this.sender] = (currentBalance + amountOut).toString();

    console.log(`Swap successful: ${amountIn} SHRIMP -> ${amountOut} Tokens`);
  }

  // Update reserves (manual sync for this simplified test)
  syncReserves(shrimpAmount, tokenAmount) {
    if (this.sender !== this.state.owner) throw new Error("Not authorized");
    this.state.shrimpBalance = BigInt(shrimpAmount).toString();
    this.state.tokenBalance = BigInt(tokenAmount).toString();
  }
}
