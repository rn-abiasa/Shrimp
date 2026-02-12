import { useParams } from "react-router-dom";
import { useTokens, usePools } from "@/hooks/useData";
import PriceChart from "@/components/dex/PriceChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function TokenDetailPage() {
  const { address } = useParams();
  const { data: tokens, isLoading: tokensLoading } = useTokens();
  const { data: pools, isLoading: poolsLoading } = usePools();

  const token = tokens?.find((t) => t.address === address);
  const pool = pools?.find((p) => p.tokenAddress === address);

  if (tokensLoading || poolsLoading)
    return <div className="text-center py-20">Syncing with chain...</div>;
  if (!token) return <div className="text-center py-20">Token not found</div>;

  const priceInShrimp = pool
    ? (Number(pool.shrimpReserve) / Number(pool.tokenReserve)).toFixed(6)
    : "No Liquidity";
  const liquidityInShrimp = pool
    ? (Number(pool.shrimpReserve) / 1e8).toFixed(2)
    : "0";

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <Link
        to="/tokens"
        className="flex items-center gap-2 text-muted-foreground hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Assets
      </Link>

      <div className="flex items-center gap-6 pb-4">
        <span className="text-6xl">{token.icon}</span>
        <div>
          <h1 className="text-4xl font-black">{token.name}</h1>
          <div className="flex items-center gap-4 text-muted-foreground mt-1">
            <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-xs">
              {token.symbol}
            </span>
            <span className="text-xs font-mono">{token.address}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <PriceChart token={token} />

          <Card className="bg-background/40 backdrop-blur-md border-slate-800">
            <CardHeader>
              <CardTitle>Token Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/50">
                  <div className="text-sm text-muted-foreground mb-1">Pair</div>
                  <div className="text-lg font-bold">
                    {token.symbol} / SHRIMP
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/50">
                  <div className="text-sm text-muted-foreground mb-1">
                    Pool Address
                  </div>
                  <div className="text-xs font-mono truncate">
                    {pool?.address || "None"}
                  </div>
                </div>
              </div>

              <a
                href={`http://localhost:3002/contract/${token.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-pink-500 hover:text-pink-400 transition-colors"
              >
                View Contract on Explorer <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="bg-background/40 backdrop-blur-md border-slate-800">
            <CardHeader>
              <CardTitle>DEX Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between border-b border-slate-800/50 pb-2">
                <span className="text-muted-foreground">Price</span>
                <span className="font-bold text-pink-500">
                  {priceInShrimp} SHRIMP
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-800/50 pb-2">
                <span className="text-muted-foreground">
                  Liquidity (SHRIMP)
                </span>
                <span className="font-bold">🦐 {liquidityInShrimp}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/50 pb-2">
                <span className="text-muted-foreground">Swap Fee</span>
                <span className="font-bold">0.3%</span>
              </div>
              <div className="pt-4">
                <Link to="/">
                  <Button className="w-full bg-pink-500 hover:bg-pink-600 font-bold">
                    Swap {token.symbol}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
