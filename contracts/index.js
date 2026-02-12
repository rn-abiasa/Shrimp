export default class BabyShrimp {
  init() {
    this.state.initialSupply = 1000000000;
    this.state.name = "Baby Shrimp";
    this.state.symbol = "BYS";
    this.state.owner = this.sender;
    this.state.balances = {};
    this.state.balances[this.sender] = this.state.initialSupply;
  }

  _balanceOfAddress(address) {
    return this.state.balances[address];
  }

  transfer(to, amount) {
    if (!to) throw new Error("Recipient is required");
    if (!amount) throw new Error("Amount is required");

    const senderBalance = this._balanceOfAddress(this.sender);

    if (senderBalance < amount) throw new Error("Insufficient balance.");

    this.state.balances[this.sender] = senderBalance - amount;
    this.state.balances[to] = this._balanceOfAddress(to) + amount;
  }
}
