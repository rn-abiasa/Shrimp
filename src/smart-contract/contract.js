import VirtualMachine from "./vm.js";
import { cryptoHash } from "../crypto/index.js";

class SmartContract {
  constructor({ state }) {
    this.state = state;
    this.MAX_CALL_DEPTH = 5;
  }

  createContract({ code, sender, nonce }) {
    // Generate Contract Address (hash of code + sender + nonce)
    // Use transaction nonce (not state nonce, which is already incremented)

    const contractAddress = cryptoHash(sender, nonce, code);

    // Initial State
    const accountData = {
      balance: 0n,
      nonce: 0,
      code: code,
      storage: {}, // Initial storage
    };

    this.state.putAccount({ address: contractAddress, accountData });

    // Execute init() if present
    const vm = new VirtualMachine({
      state: this.state,
      contractAddress,
      sender,
      sc: this,
      depth: 0,
    });

    try {
      vm.run(code, "init", []);
    } catch (error) {
      // Ignore if init not found?
      // My VM implementation throws "Method not found" if 'init' doesn't exist on the INSTANCE.
      // But user might not define init.
      // We should check if method exists first in VM or catch specific error?
      // For now, let's assume init is optional but if it fails (other than not found), we should know.
      // However, VM.run throws "Method 'init' not found" if missing.
      // We should probably allow missing init.
      if (!error.message.includes("Method 'init' not found")) {
        throw error;
      }
    }

    return contractAddress;
  }

  callContract({ contractAddress, method, args, sender, depth = 0 }) {
    if (depth > this.MAX_CALL_DEPTH) {
      throw new Error("Maximum call depth exceeded");
    }
    console.log(
      `${"  ".repeat(depth)}📞 Calling contract ${contractAddress.substring(0, 8)}: ${method}(${args.join(", ")}) from ${sender.substring(0, 8)}`,
    );
    const code = this.state.getCode(contractAddress);

    // Check if contract exists
    if (!code) {
      throw new Error(`Contract at ${contractAddress} not found`);
    }

    const vm = new VirtualMachine({
      state: this.state,
      contractAddress,
      sender,
      sc: this,
      depth,
    });

    try {
      return vm.run(code, method, args);
    } catch (error) {
      throw error;
    }
  }
}

export default SmartContract;
