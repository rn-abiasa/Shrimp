class SmartContract {
  init() {
    this.state.shrimpBalance = 0n;
    this.state.tokenBalance = 0n;
    this.state.tokenAddress = null;
    this.state.symbol = "SHRIMPS";
    this.state.name = "Shrim Stable Test";
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

    const shrimpReserve = this.balance; // Use actual native balance
    const tokenReserve = BigInt(this.state.tokenBalance || 0);

    if (shrimpReserve === 0n || tokenReserve === 0n) {
      throw new Error("No liquidity in pool");
    }

    // x * y = k logic
    // dx = amountIn
    // currentBalance = x + dx
    // dy = (y * dx) / currentBalance
    const dy = (tokenReserve * amountIn) / shrimpReserve;

    // Apply 0.3% fee
    const amountOut = (dy * 997n) / 1000n;

    if (amountOut > tokenReserve)
      throw new Error(
        `Likuiditas token tidak mencukupi. Tersedia: ${tokenReserve}, Butuh: ${amountOut}`,
      );
    if (amountOut <= 0n) throw new Error("Jumlah swap terlalu kecil");

    // Update reserves
    this.state.shrimpBalance = shrimpReserve.toString();
    this.state.tokenBalance = (tokenReserve - amountOut).toString();

    // Transfer actual tokens to user using cross-contract call
    this.call(this.state.tokenAddress, "transfer", [
      this.sender,
      amountOut.toString(),
    ]);

    console.log(`Swap successful: ${amountIn} SHRIMP -> ${amountOut} Tokens`);
  }

  // Swap Tokens for Native SHRIMP
  sell() {
    if (!this.state.tokenAddress) throw new Error("Pool not setup");

    const tokenAddress = this.state.tokenAddress;
    const shrimpReserve = this.balance; // Use actual native balance
    const tokenReserve = BigInt(this.state.tokenBalance || 0);

    // 1. Check how many tokens were actually sent to this pool
    // This requires the token contract to have _balanceOfAddress or balance method
    const actualTokenBalance = BigInt(
      this.call(tokenAddress, "balanceOf", [this.contractAddress]),
    );
    const amountIn = actualTokenBalance - tokenReserve;

    if (amountIn <= 0n)
      throw new Error(
        "No tokens received for swap. Transfer tokens to pool first.",
      );

    // x * y = k logic
    // dx = amountIn (tokens)
    // dy = (shrimpReserve * dx) / (tokenReserve + dx)
    const dy = (shrimpReserve * amountIn) / (tokenReserve + amountIn);

    // Apply 0.3% fee
    const amountOut = (dy * 997n) / 1000n;

    if (amountOut > shrimpReserve)
      throw new Error("Pool insufficient SHRIMP liquidity");
    if (amountOut <= 0n) throw new Error("Swap amount too small");

    // 2. Transfer SHRIMP to user
    this.transferShrimp(this.sender, amountOut.toString());

    // 3. Update reserves
    this.state.shrimpBalance = (shrimpReserve - amountOut).toString();
    this.state.tokenBalance = actualTokenBalance.toString();

    console.log(`Sell successful: ${amountIn} Tokens -> ${amountOut} SHRIMP`);
  }

  // Update reserves (manual sync for this simplified test)
  syncReserves(shrimpAmount, tokenAmount) {
    if (this.sender !== this.state.owner) throw new Error("Not authorized");
    // We can only sync storage here. The real balance depends on actual transfers.
    this.state.shrimpBalance = this.balance.toString();
    this.state.tokenBalance = BigInt(tokenAmount).toString();
  }
}

// Version: v2-fixed-recursive-calls
// Features: support sell(), this.call return values, this.transferShrimp
// Version: v2-fixed-recursive-calls
