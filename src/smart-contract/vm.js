import vm from "vm";

class VirtualMachine {
  constructor({ state, contractAddress, sender, sc, depth = 0 }) {
    this.state = state;
    this.contractAddress = contractAddress;
    this.sender = sender;
    this.sc = sc;
    this.depth = depth;
  }

  run(code, method, args = []) {
    const account = this.state.getAccount(this.contractAddress);
    const contractStorage = account.storage || {};

    // Sandbox Context
    const sandbox = {
      state: contractStorage, // Direct access to storage
      sender: this.sender,
      args: args,
      BigInt: BigInt,
      Error: Error,
      Number: Number,
      Math: Math,
      console: { log: (...msgs) => {} }, // Silenced internal contract logs
      this_call: (contractAddress, method, args) => {
        if (!this.sc)
          throw new Error("SmartContract controller not linked to VM");
        return this.sc.callContract({
          contractAddress,
          method,
          args,
          sender: this.contractAddress, // The current contract is the sender for the sub-call
          depth: (this.depth || 0) + 1,
        });
      },
      transfer_shrimp: (to, amount) => {
        const amt = BigInt(amount);
        const target = to.toLowerCase();
        const self = this.contractAddress.toLowerCase();

        const contractAcc = this.state.getAccount(self);
        if (contractAcc.balance < amt)
          throw new Error("Contract insufficient SHRIMP balance");

        const recipientAcc = this.state.getAccount(target);
        contractAcc.balance -= amt;
        recipientAcc.balance += amt;

        this.state.putAccount({
          address: self,
          accountData: contractAcc,
        });
        this.state.putAccount({ address: target, accountData: recipientAcc });
      },
      result_output: null,
    };

    vm.createContext(sandbox);

    // Wrapper to instantiate the user's class (assumed to be named 'Contract' or the LAST defined class)
    // We'll enforce that the user code must define a class named 'SmartContract' for simplicity.
    const executionScript = `
      try {
        // Strip 'export default' if present as it's not valid in script context
        ${code.replace(/export default\s+/g, "")}
        
        let ContractClass;
        if (typeof SmartContract !== 'undefined') {
          ContractClass = SmartContract;
        } else {
          // Heuristic: Find the first class defined in this scope
          const keys = Object.keys(this);
          for (const key of keys) {
            if (typeof this[key] === 'function' && 
                this[key].prototype && 
                this[key].prototype.constructor.toString().startsWith('class')) {
              ContractClass = this[key];
              break;
            }
          }
        }

        if (!ContractClass) {
          throw new Error("No contract class found. Ensure you define a class (e.g., class SmartContract).");
        }

        const contract = new ContractClass();
        
        // Inject system properties
        contract.state = state;
        contract.sender = sender;
        contract.contractAddress = '${this.contractAddress}';
        contract.balance = BigInt('${account.balance}');
        contract.call = this_call;
        contract.transferShrimp = transfer_shrimp;

        // Execute method
        let result;
        if (typeof contract['${method}'] === 'function') {
          result = contract['${method}'](...args);
        } else {
          throw new Error("Method '${method}' not found.");
        }
        
        result_output = result;
      } catch (e) {
        throw e;
      }
    `;

    try {
      vm.runInContext(executionScript, sandbox, { timeout: 1000 }); // 1s timeout

      // Update global state with modified storage
      // Fetch latest account state as it may have been updated by transfer_shrimp
      const latestAccount = this.state.getAccount(this.contractAddress);
      latestAccount.storage = sandbox.state;

      this.state.putAccount({
        address: this.contractAddress,
        accountData: latestAccount,
      });

      return sandbox.result_output;
    } catch (error) {
      // Re-throw to be caught by block validator
      throw new Error(`Smart Contract Execution Failed: ${error.message}`);
    }
  }
}

export default VirtualMachine;
