import vm from "vm";

class VirtualMachine {
  constructor({ state, contractAddress, sender }) {
    this.state = state;
    this.contractAddress = contractAddress;
    this.sender = sender;
  }

  run(code, method, args = []) {
    const account = this.state.getAccount(this.contractAddress);
    const contractStorage = account.storage || {};

    // Sandbox Context
    const sandbox = {
      state: contractStorage, // Direct access to storage
      sender: this.sender,
      args: args,
      console: { log: () => {} }, // Disable logging for security/noise
      // Expose limited API if needed
    };

    vm.createContext(sandbox);

    // Wrapper to instantiate the user's class (assumed to be named 'Contract' or the LAST defined class)
    // We'll enforce that the user code must define a class named 'SmartContract' for simplicity.
    const executionScript = `
      ${code} // Inject user code

      // Attempt to find the contract class
      let ContractClass;
      try {
        ContractClass = SmartContract;
      } catch (e) {
        throw new Error("User code must define 'class SmartContract'");
      }

      const contract = new ContractClass();
      
      // Inject system properties
      contract.state = state;
      contract.sender = sender;

      // Execute method
      if (typeof contract['${method}'] === 'function') {
        contract['${method}'](...args);
      } else {
        throw new Error("Method '${method}' not found.");
      }
    `;

    try {
      vm.runInContext(executionScript, sandbox, { timeout: 1000 }); // 1s timeout

      // Update global state with modified storage
      account.storage = sandbox.state;
      this.state.putAccount({
        address: this.contractAddress,
        accountData: account,
      });
    } catch (error) {
      // Re-throw to be caught by block validator
      throw new Error(`Smart Contract Execution Failed: ${error.message}`);
    }
  }
}

export default VirtualMachine;
