class SmartContract {
  init() {
    this.state.initialSupply = 100000000n; // 100M BYS
    this.state.name = "Test Token";
    this.state.symbol = "TST";
    this.state.owner = this.sender;
    this.state.balances = {};
    this.state.balances[this.sender] = this.state.initialSupply;
  }

  _balanceOfAddress(address) {
    const bal = this.state.balances[address];
    return bal !== undefined ? BigInt(bal) : 0n;
  }

  transfer(to, amount) {
    if (!to) throw new Error("Recipient is required");
    if (!amount) throw new Error("Amount is required");

    // Convert to BigInt if it's a string/number from args
    const amt = BigInt(amount);

    const senderBalance = this._balanceOfAddress(this.sender);

    if (senderBalance < amt) throw new Error("Insufficient balance.");

    const recipientBalance = this._balanceOfAddress(to);

    this.state.balances[this.sender] = (senderBalance - amt).toString();
    this.state.balances[to] = (recipientBalance + amt).toString();
  }
}
