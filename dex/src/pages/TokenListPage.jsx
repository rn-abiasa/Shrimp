import { useNavigate } from "react-router-dom";
import { useTokens, usePools } from "@/hooks/useData";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function TokenListPage() {
  const { data: tokens, isLoading: tokensLoading } = useTokens();
  const { data: pools, isLoading: poolsLoading } = usePools();
  const navigate = useNavigate();

  const tokensWithStats = tokens
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

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="pb-6 border-b border-slate-800">
        <h1 className="text-3xl font-bold">Assets</h1>
        <p className="text-muted-foreground">
          Tokens paired with SHRIMP on the native DEX
        </p>
      </div>

      <Card className="bg-background/40 backdrop-blur-md border-slate-800">
        <CardContent className="p-0">
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-slate-900/50 border-y border-slate-800">
                <tr>
                  <th className="px-6 py-4">Token</th>
                  <th className="px-6 py-4 text-right">Price (SHRIMP)</th>
                  <th className="px-6 py-4 text-right">Pool Liquidity</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tokensLoading || poolsLoading ? (
                  <tr>
                    <td colSpan="4" className="p-8 text-center animate-pulse">
                      Syncing assets...
                    </td>
                  </tr>
                ) : (
                  tokensWithStats?.map((token) => (
                    <tr
                      key={token.address}
                      className="hover:bg-slate-800/20 transition-colors"
                    >
                      <td className="px-6 py-4 flex items-center gap-3">
                        <span className="text-2xl">{token.icon}</span>
                        <div>
                          <div className="font-bold">{token.name}</div>
                          <div className="text-xs font-mono text-muted-foreground uppercase">
                            {token.symbol}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-pink-500/80">
                        {token.price}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-xs text-muted-foreground">
                          🦐
                        </span>{" "}
                        {token.liquidity}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-pink-500 hover:text-white hover:bg-pink-500"
                          onClick={() => navigate(`/token/${token.address}`)}
                        >
                          Trade
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
