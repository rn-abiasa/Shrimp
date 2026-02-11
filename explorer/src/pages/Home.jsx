import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { StatsCard } from "../components/stats/StatsCard";
import { TransactionChart } from "../components/stats/TransactionChart";
import { BlockCard } from "../components/blocks/BlockCard";
import { TransactionCard } from "../components/transactions/TransactionCard";
import { Button } from "../components/ui/button";
import { Link } from "react-router-dom";
import {
  Blocks,
  ArrowRightLeft,
  Clock,
  Coins,
  TrendingUp,
  Database,
} from "lucide-react";
import { formatNumber, formatCurrency } from "../lib/utils";

export function Home() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.getStats(),
    refetchInterval: 5000,
  });

  const { data: blocksData, isLoading: blocksLoading } = useQuery({
    queryKey: ["blocks", 6],
    queryFn: () => api.getBlocks(6, 0),
    refetchInterval: 10000,
  });

  const { data: transactionsData, isLoading: transactionsLoading } = useQuery({
    queryKey: ["transactions", 6],
    queryFn: () => api.getTransactions(6, 0),
    refetchInterval: 10000,
  });

  const { data: mempoolData, isLoading: mempoolLoading } = useQuery({
    queryKey: ["mempool", 6],
    queryFn: () => api.getMempool(6, 0),
    refetchInterval: 3000,
  });

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["chart"],
    queryFn: () => api.getTransactionChart(7),
    refetchInterval: 60000,
  });

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Network Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatsCard
          title="Block Height"
          value={formatNumber(stats?.height)}
          icon={Blocks}
          isLoading={statsLoading}
        />
        <StatsCard
          title="Total Transactions"
          value={formatNumber(stats?.totalTransactions)}
          icon={ArrowRightLeft}
          isLoading={statsLoading}
        />
        <StatsCard
          title="Max Supply"
          value={formatCurrency(stats?.maxSupply)}
          icon={Coins}
          isLoading={statsLoading}
        />
        <StatsCard
          title="Circulating Supply"
          value={formatCurrency(stats?.circulatingSupply)}
          icon={TrendingUp}
          isLoading={statsLoading}
        />
        <StatsCard
          title="Unmined Supply"
          value={formatCurrency(stats?.unminedSupply)}
          icon={Database}
          isLoading={statsLoading}
        />
        <StatsCard
          title="Mempool Size"
          value={formatNumber(stats?.mempoolSize)}
          icon={Clock}
          isLoading={statsLoading}
        />
      </div>

      {/* Transaction Chart */}
      <TransactionChart data={chartData || []} isLoading={chartLoading} />

      {/* Latest Blocks */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Latest Blocks</h2>
          <Link to="/blocks">
            <Button variant="outline">View More</Button>
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {blocksLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-48 bg-muted animate-pulse rounded-xl"
                />
              ))
            : blocksData?.blocks.map((block) => (
                <BlockCard key={block.index} block={block} />
              ))}
        </div>
      </div>

      {/* Latest Transactions */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Latest Transactions</h2>
          <Link to="/transactions">
            <Button variant="outline">View More</Button>
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {transactionsLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-48 bg-muted animate-pulse rounded-xl"
                />
              ))
            : transactionsData?.transactions.map((tx) => (
                <TransactionCard key={tx.id} transaction={tx} />
              ))}
        </div>
      </div>

      {/* Mempool */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Mempool (Pending Transactions)</h2>
          <Link to="/mempool">
            <Button variant="outline">View More</Button>
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {mempoolLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />
            ))
          ) : mempoolData?.transactions.length > 0 ? (
            mempoolData.transactions.map((tx) => (
              <TransactionCard key={tx.id} transaction={tx} />
            ))
          ) : (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No pending transactions
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
