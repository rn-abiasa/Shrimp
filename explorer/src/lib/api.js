const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

class ApiClient {
  async get(endpoint) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`);
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }
    return response.json();
  }

  // Explorer Stats
  async getStats() {
    return this.get("/api/explorer/stats");
  }

  // Blocks
  async getBlocks(limit = 10, offset = 0) {
    return this.get(`/api/explorer/blocks?limit=${limit}&offset=${offset}`);
  }

  async getBlock(indexOrHash) {
    return this.get(`/api/explorer/block/${indexOrHash}`);
  }

  // Transactions
  async getTransactions(limit = 10, offset = 0) {
    return this.get(
      `/api/explorer/transactions?limit=${limit}&offset=${offset}`,
    );
  }

  async getTransaction(hash) {
    return this.get(`/api/explorer/transaction/${hash}`);
  }

  // Address
  async getAddress(address) {
    return this.get(`/api/explorer/address/${address}`);
  }

  // Search
  async search(query) {
    return this.get(`/api/explorer/search?q=${encodeURIComponent(query)}`);
  }

  // Chart Data
  async getTransactionChart(days = 7) {
    return this.get(`/api/explorer/chart/transactions?days=${days}`);
  }

  // Mempool
  async getMempool(limit = 10, offset = 0) {
    return this.get(`/api/explorer/mempool?limit=${limit}&offset=${offset}`);
  }
  // Contracts
  async getContracts(limit = 10, offset = 0) {
    return this.get(`/api/explorer/contracts?limit=${limit}&offset=${offset}`);
  }

  async getContract(address) {
    return this.get(`/api/explorer/contract/${address}`);
  }

  async getContractTransactions(address) {
    return this.get(`/api/explorer/contract/${address}/transactions`);
  }

  async getContractHolders(address) {
    return this.get(`/api/explorer/contract/${address}/holders`);
  }
}

export const api = new ApiClient();
