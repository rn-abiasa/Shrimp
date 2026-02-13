import { useParams, Link } from "react-router-dom";
import { useTokens, usePools, useTransactions } from "@/hooks/useData";
import PriceChart from "@/components/dex/PriceChart";
import { getTokenGradient } from "@/lib/ui-utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  Copy,
  ExternalLink,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

export default function TokenDetailPage() {
  const { address } = useParams();
  const { data: tokens, isLoading: tokensLoading } = useTokens();
  const { data: pools, isLoading: poolsLoading } = usePools();
  const { data: transactionsData } = useTransactions(50);

  const token = tokens?.find((t) => t.address === address);
  const pool = pools?.find((p) => p.tokenAddress === address);

  // Filter transactions for this specific token
  const tokenTransactions =
    transactionsData?.transactions?.filter(
      (tx) =>
        tx.recipient === address ||
        (tx.type === "CALL_CONTRACT" &&
          (tx.data.args?.[0] === address || tx.recipient === pool?.address)),
    ) || [];

  if (tokensLoading || poolsLoading)
    return (
      <div className="text-center py-20 text-muted-foreground animate-pulse font-bold uppercase tracking-widest text-xs">
        Fetching Asset Insight...
      </div>
    );
  if (!token)
    return (
      <div className="text-center py-20 font-black text-2xl">
        Token not found
      </div>
    );

  const priceInShrimp = pool
    ? (Number(pool.shrimpReserve) / Number(pool.tokenReserve)).toFixed(6)
    : "0.00";
  const liquidityInShrimp = pool
    ? Number(((pool.shrimpReserve || 0n) * 2n) / 100000000n).toLocaleString()
    : "0";

  return (
    <div className="space-y-12 pb-20">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <Link to="/explore" className="hover:text-primary transition-colors">
          Explore
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground">{token.name}</span>
        <span className="text-muted-foreground/50 font-mono lower px-2 py-0.5 bg-muted rounded">
          {token.address?.substring(0, 12)}...
        </span>
      </nav>

      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black tracking-tighter">
                {token.name}
              </h1>
              <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-black tracking-widest">
                {token.symbol}
              </span>
            </div>
            <p className="text-muted-foreground font-medium">
              Native asset insight and market dynamics for {token.symbol}.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="rounded-2xl gap-2 font-bold h-12 px-6 border-border/50 hover:bg-muted"
            onClick={() => navigator.clipboard.writeText(token.address)}
          >
            <Copy className="h-4 w-4" /> Copy
          </Button>
          <a
            href={`http://localhost:3002/contract/${token.address}`}
            target="_blank"
            rel="noreferrer"
          >
            <Button
              variant="outline"
              className="rounded-2xl gap-2 font-bold h-12 px-6 border-border/50 hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" /> Explorer
            </Button>
          </a>
          <Link to="/">
            <Button className="rounded-2xl font-black h-12 px-10 shadow-xl shadow-primary/20">
              Swap
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left Col: Chart & History */}
        <div className="lg:col-span-8 space-y-12">
          <div className="bg-card border border-border/50 rounded-[2.5rem] overflow-hidden p-8 h-[450px] shadow-sm">
            <PriceChart token={token} />
          </div>

          <div className="space-y-6">
            <h2 className="text-2xl font-black px-1 tracking-tight">
              Recent Activity
            </h2>
            <div className="border border-border/50 rounded-[2rem] overflow-hidden bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-muted/30 h-14">
                    <TableHead className="text-[10px] font-bold uppercase pl-6">
                      Type
                    </TableHead>
                    <TableHead className="text-[10px] font-bold uppercase">
                      Account
                    </TableHead>
                    <TableHead className="text-right text-[10px] font-bold uppercase">
                      Amount
                    </TableHead>
                    <TableHead className="text-right text-[10px] font-bold uppercase pr-6">
                      Time
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokenTransactions.length > 0 ? (
                    tokenTransactions.map((tx) => (
                      <TableRow key={tx.id} className="h-16 group">
                        <TableCell className="pl-6">
                          <span
                            className={`text-[9px] px-2.5 py-1.5 rounded-lg font-black uppercase tracking-wider ${
                              tx.type === "CALL_CONTRACT"
                                ? "bg-primary/20 text-primary"
                                : "bg-green-500/20 text-green-500"
                            }`}
                          >
                            {tx.type}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs opacity-70 group-hover:opacity-100 transition-opacity">
                          {tx.input?.address?.substring(0, 12)}...
                        </TableCell>
                        <TableCell className="text-right font-mono font-black text-sm text-foreground">
                          {Number(
                            BigInt(tx.input?.amount || 0) / 100000000n,
                          ).toLocaleString()}{" "}
                          {token.symbol}
                        </TableCell>
                        <TableCell className="text-right text-[11px] text-muted-foreground font-medium pr-6">
                          {tx.input?.timestamp
                            ? new Date(tx.input.timestamp).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" },
                              )
                            : "--"}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-20 text-muted-foreground font-bold uppercase text-[10px] tracking-[0.3em]"
                      >
                        No historical data found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Right Col: Stats & About */}
        <div className="lg:col-span-4 space-y-8">
          <Card className="rounded-[2.5rem] border-border/50 bg-card shadow-sm pt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                Market Intel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-8">
              <div>
                <p className="text-[10px] text-muted-foreground mb-1 uppercase font-bold tracking-tight">
                  Price in SHRIMP
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-5xl font-black font-mono tracking-tighter">
                    {priceInShrimp}
                  </span>
                  <span className="text-orange-500 font-bold text-lg pt-4">
                    🦐
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-8 border-t border-border/50 pt-8">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1 uppercase font-bold tracking-tight">
                    Total TVL
                  </p>
                  <p className="text-xl font-black font-mono tracking-tight">
                    {liquidityInShrimp}
                  </p>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">
                    SHRIMP 🦐
                  </span>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1 uppercase font-bold tracking-tight">
                    Protocol Fee
                  </p>
                  <p className="text-xl font-black font-mono tracking-tight text-primary">
                    0.3%
                  </p>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Per Swap
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[2.5rem] border-border/50 bg-card shadow-sm pt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                Protocol About
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-muted-foreground leading-relaxed font-medium">
                {token.name} is a native decentralized asset on ShrimpChain.
                Market dynamics are driven by automated liquidity on the
                ShrimpSwap Protocol.
              </p>
              <div className="space-y-4 pt-4 border-t border-border/50">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                    Contract Protocol
                  </span>
                  <div className="group flex items-center justify-between bg-muted/40 px-3 py-2 rounded-xl border border-transparent hover:border-border transition-all">
                    <span className="text-[11px] font-mono font-bold truncate max-w-[200px]">
                      {token.address}
                    </span>
                    <Copy
                      className="size-3 text-muted-foreground hover:text-black cursor-pointer"
                      onClick={() =>
                        navigator.clipboard.writeText(token.address)
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 pt-2">
                  <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                    Protocol Utility
                  </span>
                  <span className="text-sm font-black text-foreground">
                    Yield & Governance
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
