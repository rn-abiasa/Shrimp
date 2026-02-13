const API_BASE_URL = "http://localhost:3001";

class DexApiClient {
  async get(endpoint) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`);
      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      console.error(`Dex API Fetch Error (${endpoint}):`, error);
      throw error;
    }
  }

  // Network Stats
  async getStats() {
    return this.get("/api/explorer/stats");
  }

  // Contracts (Tokens)
  async getContracts(limit = 100, offset = 0) {
    return this.get(`/api/explorer/contracts?limit=${limit}&offset=${offset}`);
  }

  async getContract(address) {
    return this.get(`/api/explorer/contract/${address}`);
  }

  // Transactions
  async getTransactions(limit = 100, offset = 0) {
    return this.get(
      `/api/explorer/transactions?limit=${limit}&offset=${offset}`,
    );
  }

  async post(endpoint, body) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body, (key, value) =>
          typeof value === "bigint" ? value.toString() : value,
        ),
      });
      let result;
      const text = await response.text();
      try {
        result = JSON.parse(text);
      } catch (e) {
        if (!response.ok) {
          throw new Error(
            `Server Error (${response.status}): ${text || response.statusText}`,
          );
        }
        throw new Error("Invalid response from server");
      }

      if (!response.ok) {
        throw new Error(
          result.message ||
            result.error ||
            `Post request failed (${response.status})`,
        );
      }
      return result;
    } catch (error) {
      console.error(`Dex API Post Error (${endpoint}):`, error);
      throw error;
    }
  }

  // Address Balances
  async getAddress(address) {
    return this.get(`/api/explorer/address/${address}`);
  }

  // Submit Transaction
  async transact(transaction) {
    return this.post("/transact", { transaction });
  }

  // Token Price History
  async getTokenHistory(address, range = "1D") {
    return this.get(`/api/explorer/token/${address}/history?range=${range}`);
  }

  // Trigger Mining (for dev)
  async mine() {
    return this.post("/mine", {});
  }
}

export const dexApi = new DexApiClient();
