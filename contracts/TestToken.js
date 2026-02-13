class SmartContract {
  init() {
    this.state.initialSupply = (1000n * 1000n * 1000n * 1000n).toString(); // 1 Trillion
    this.state.name = "Shrimp Vibe";
    this.state.symbol = "ShrimpVibe";
    this.state.owner = this.sender;
    this.state.balances = {};
    this.state.balances[this.sender] = this.state.initialSupply;
  }

  _balanceOfAddress(address) {
    const bal = this.state.balances[address];
    return bal !== undefined ? BigInt(bal) : 0n;
  }

  balanceOf(address) {
    return this._balanceOfAddress(address).toString();
  }

  transfer(to, amount) {
    if (!to) throw new Error("Recipient is required");
    if (!amount) throw new Error("Amount is required");

    const amt = BigInt(amount);
    const senderBalance = this._balanceOfAddress(this.sender);

    if (senderBalance < amt) throw new Error("Insufficient balance.");

    const recipientBalance = this._balanceOfAddress(to);

    this.state.balances[this.sender] = (senderBalance - amt).toString();
    this.state.balances[to] = (recipientBalance + amt).toString();
  }
}
