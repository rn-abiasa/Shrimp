# Security & Consensus Model

## specific Question: Can a node modify INITIAL_BALANCE to get free coins?

**Short Answer: No.**

### Explanation

In a decentralized blockchain, the "truth" is determined by **Consensus**, not by any single node's configuration file.

If a malicious node modifies `src/config.js` to set `INITIAL_BALANCE = 1000`:

1.  **Local View**: That node will _think_ it has 1000 coins.
2.  **Transaction Creation**: It can create and sign a transaction sending 500 coins to someone.
3.  **Broadcast**: It sends this transaction to the network (to honest nodes).
4.  **REJECTION**:
    - Honest nodes (running the official code with `INITIAL_BALANCE = 0`) receive the transaction.
    - They independently validate the sender's balance using _their_ own ledger and rules.
    - They calculate the sender's balance is **0**.
    - They see the transaction tries to spend **500**.
    - **Result**: The transaction is marked **INVALID** and dropped. It never enters a block.

### Conclusion

A node can change its own rules, but it cannot force other nodes to accept them. By changing the rules locally, a node simply "forks" itself off the main network and becomes incompatible with everyone else.

To ensure production security:

- Keep `INITIAL_BALANCE = 0`.
- All valid coins must be created through **Mining** (Coinbase transactions) or a pre-defined **Genesis Transaction** (if a pre-mine is desired).
