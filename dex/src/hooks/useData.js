import { useQuery } from "@tanstack/react-query";
import { dexApi } from "../lib/api";

export function useTokens() {
  return useQuery({
    queryKey: ["tokens"],
    queryFn: async () => {
      const data = await dexApi.getContracts();

      // 1. Identify pools with active liquidity
      const lpTokenAddresses = data.contracts
        .filter(
          (c) =>
            c.metadata &&
            c.metadata.shrimpBalance !== undefined &&
            c.metadata.tokenBalance !== undefined &&
            c.metadata.tokenAddress,
        )
        .sort((a, b) => {
          const balA = BigInt(a.metadata.shrimpBalance || 0);
          const balB = BigInt(b.metadata.shrimpBalance || 0);
          return balB > balA ? 1 : -1; // Sort by liquidity descending
        })
        .map((c) => c.metadata.tokenAddress.toLowerCase());

      // 2. Filter contracts that look like tokens AND have a pool (or are SHRIMP)
      const tokens = data.contracts
        .filter((c) => {
          const isToken = c.metadata && (c.metadata.symbol || c.metadata.name);
          const hasLP = lpTokenAddresses.includes(c.address.toLowerCase());
          return isToken && hasLP;
        })
        .map((c) => ({
          address: c.address,
          symbol: c.metadata.symbol || "UNKNOWN",
          name: c.metadata.name || "Unknown Token",
        }));

      // Native SHRIMP (always has liquidity by definition or as base pair)
      const nativeToken = {
        symbol: "SHRIMP",
        name: "Shrimp Coin",
        address: "native",
      };

      return [nativeToken, ...tokens];
    },
    refetchInterval: 10000,
  });
}

export function usePools() {
  return useQuery({
    queryKey: ["pools"],
    queryFn: async () => {
      const data = await dexApi.getContracts();
      // Identify pools: Contracts that have 'shrimpBalance' and 'tokenBalance' in metadata
      return data.contracts
        .filter(
          (c) =>
            c.metadata &&
            c.metadata.shrimpBalance !== undefined &&
            c.metadata.tokenBalance !== undefined,
        )
        .sort((a, b) => {
          const balA = BigInt(a.metadata.shrimpBalance || 0);
          const balB = BigInt(b.metadata.shrimpBalance || 0);
          return balB > balA ? 1 : -1; // Sort by liquidity descending
        })
        .map((c) => ({
          address: c.address,
          tokenAddress: c.metadata.tokenAddress,
          shrimpReserve: BigInt(c.balance || 0), // Use real on-chain balance
          tokenReserve: BigInt(c.metadata.tokenBalance || 0),
          fee: c.metadata.fee || 30, // Default 0.3%
        }));
    },
    refetchInterval: 5000,
  });
}

export function useNetworkStats() {
  return useQuery({
    queryKey: ["networkStats"],
    queryFn: () => dexApi.getStats(),
    refetchInterval: 5000,
  });
}

export function useAddress(address) {
  return useQuery({
    queryKey: ["address", address],
    queryFn: () => dexApi.getAddress(address),
    enabled: !!address,
    refetchInterval: 5000,
  });
}

export function useTransactions(limit = 100) {
  return useQuery({
    queryKey: ["transactions", limit],
    queryFn: () => dexApi.getTransactions(limit),
    refetchInterval: 5000,
  });
}

export function useTokenHistory(address) {
  return useQuery({
    queryKey: ["tokenHistory", address],
    queryFn: () => dexApi.getTokenHistory(address),
    enabled: !!address && address !== "native",
    refetchInterval: 30000,
  });
}
