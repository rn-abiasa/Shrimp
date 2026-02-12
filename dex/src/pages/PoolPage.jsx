import { Plus, Droplets, Info, Wallet } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePools, useTokens } from "@/hooks/useData";
import { useWebWallet } from "@/hooks/useWebWallet";

export default function PoolPage() {
  const { data: pools, isLoading: poolsLoading } = usePools();
  const { data: tokens } = useTokens();
  const { isConnected, balance } = useWebWallet();

  const enrichedPools = pools?.map((pool) => {
    const token = tokens?.find(
      (t) => t.address?.toLowerCase() === pool.tokenAddress?.toLowerCase(),
    );
    return {
      ...pool,
      symbol: token?.symbol || "TOKEN",
      name: token?.name || "Unknown Token",
      apr: "24.2%", // Mock APR for now, but linked to real pools
    };
  });

  const totalShrimpLiquidity =
    pools?.reduce((sum, p) => sum + p.shrimpReserve, 0n) || 0n;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 pb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            Liquidity Pools
          </h1>
          <p className="text-muted-foreground">
            Provide SHRIMP and tokens to earn trade fees.
          </p>
        </div>
        <Button
          disabled={!isConnected}
          className="bg-pink-500 hover:bg-pink-600 font-bold gap-2 h-12 px-6 rounded-xl shadow-lg shadow-pink-500/20 transition-all hover:scale-[1.02]"
        >
          <Plus className="h-5 w-5" />
          Create New Pair
        </Button>
      </div>

      {!isConnected && (
        <div className="bg-pink-500/10 border border-pink-500/30 rounded-2xl p-6 text-pink-500 flex flex-col items-center gap-4 text-center">
          <div className="p-3 bg-pink-500/20 rounded-full">
            <Wallet className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Connect Your Wallet</h3>
            <p className="text-sm opacity-80 max-w-md">
              You need to connect your web wallet to manage liquidity positions
              and earn rewards on ShrimpChain.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-gradient-to-br from-pink-500/20 to-transparent border border-pink-500/20 shadow-xl">
          <div className="text-xs text-pink-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
            <Droplets className="h-3 w-3" /> Total SHRIMP Staked
          </div>
          <div className="text-3xl font-black">
            🦐 {(Number(totalShrimpLiquidity) / 1e8).toFixed(2)}
          </div>
        </div>
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-lg">
          <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-2">
            My Position
          </div>
          <div className="text-3xl font-black text-slate-400">
            {isConnected ? "🦐 0.00" : "0.00"}
          </div>
        </div>
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-lg">
          <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-2">
            Fees Earned
          </div>
          <div className="text-3xl font-black text-slate-400">
            {isConnected ? "🦐 0.00" : "0.00"}
          </div>
        </div>
      </div>

      <Card className="bg-background/40 backdrop-blur-md border-slate-800 overflow-hidden">
        <CardHeader className="border-b border-slate-800/50">
          <CardTitle>Discovery Pools</CardTitle>
          <CardDescription>
            Active liquidity pairs on ShrimpChain
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-slate-900/50 border-y border-slate-800">
                <tr>
                  <th className="px-6 py-4">Pair</th>
                  <th className="px-6 py-4 text-right">SHRIMP Reserve</th>
                  <th className="px-6 py-4 text-right">Token Reserve</th>
                  <th className="px-6 py-4 text-center">APY</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {poolsLoading ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center animate-pulse">
                      Fetching liquidity state...
                    </td>
                  </tr>
                ) : (
                  enrichedPools?.map((pool, i) => (
                    <tr
                      key={i}
                      className="hover:bg-slate-800/20 transition-colors"
                    >
                      <td className="px-6 py-4 font-bold text-md flex items-center gap-2">
                        <span className="text-pink-500">🦐</span>
                        {pool.symbol} / SHRIMP
                      </td>
                      <td className="px-6 py-4 text-right font-mono">
                        {(Number(pool.shrimpReserve) / 1e8).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-muted-foreground">
                        {(Number(pool.tokenReserve) / 1e8).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-2 py-1 rounded bg-green-500/10 text-green-500 font-bold">
                          {pool.apr}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!isConnected}
                          className="text-pink-500 hover:bg-pink-500 hover:text-white"
                        >
                          Add Liquidity
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
                {!poolsLoading && enrichedPools?.length === 0 && (
                  <tr>
                    <td
                      colSpan="5"
                      className="p-16 text-center text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <Info className="h-8 w-8 opacity-20" />
                        <p>No liquidity pools found on chain yet.</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 border-slate-700"
                          disabled={!isConnected}
                        >
                          Create the first pool
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
