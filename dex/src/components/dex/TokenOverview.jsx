import { useNavigate } from "react-router-dom";
import { useTokens, usePools } from "@/hooks/useData";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Coins } from "lucide-react";

export default function TokenOverview() {
  const { data: tokens, isLoading: tokensLoading } = useTokens();
  const { data: pools, isLoading: poolsLoading } = usePools();
  const navigate = useNavigate();

  const tokensWithPools = tokens
    ?.filter((t) => t.address !== "native")
    .map((token) => {
      const pool = pools?.find((p) => p.tokenAddress === token.address);
      return {
        ...token,
        liquidity: pool ? (Number(pool.shrimpReserve) / 1e8).toFixed(2) : "0",
        price: pool
          ? (Number(pool.shrimpReserve) / Number(pool.tokenReserve)).toFixed(6)
          : "No Liquidity",
      };
    })
    .sort((a, b) => parseFloat(b.liquidity) - parseFloat(a.liquidity));

  const displayTokens = tokensWithPools?.slice(0, 5);

  return (
    <Card className="bg-background/40 backdrop-blur-md border-slate-800">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-pink-500" />
            Active Tokens
          </CardTitle>
          <CardDescription>Tokens with SHRIMP liquidity pools</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/tokens")}
          className="text-pink-500 hover:text-pink-400"
        >
          View All <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-slate-900/50 border-y border-slate-800">
              <tr>
                <th className="px-6 py-3">Asset</th>
                <th className="px-6 py-3 text-right">Price (SHRIMP)</th>
                <th className="px-6 py-3 text-right">Liquidity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {tokensLoading || poolsLoading ? (
                <tr>
                  <td colSpan="3" className="p-6 text-center animate-pulse">
                    Scanning Reserves...
                  </td>
                </tr>
              ) : (
                displayTokens?.map((token) => (
                  <tr
                    key={token.address}
                    className="hover:bg-slate-800/20 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/token/${token.address}`)}
                  >
                    <td className="px-6 py-4 flex items-center gap-3">
                      <span className="text-xl">{token.icon}</span>
                      <div className="flex flex-col">
                        <span className="font-bold">{token.symbol}</span>
                        <span className="text-xs text-muted-foreground">
                          {token.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-pink-500/90">
                      {token.price}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-xs text-muted-foreground mr-1">
                        🦐
                      </span>
                      {token.liquidity}
                    </td>
                  </tr>
                ))
              )}
              {!tokensLoading && displayTokens?.length === 0 && (
                <tr>
                  <td
                    colSpan="3"
                    className="p-10 text-center text-muted-foreground"
                  >
                    No active pools found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
