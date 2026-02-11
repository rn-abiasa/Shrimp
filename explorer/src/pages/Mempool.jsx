import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { TransactionCard } from "../components/transactions/TransactionCard";

export function Mempool() {
  const { data, isLoading } = useQuery({
    queryKey: ["mempool", 50],
    queryFn: () => api.getMempool(50, 0),
    refetchInterval: 3000,
  });

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Mempool</h1>
        <div className="text-sm text-muted-foreground">
          {data?.total || 0} pending transaction{data?.total !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />
          ))
        ) : data?.transactions.length > 0 ? (
          data.transactions.map((tx) => (
            <TransactionCard key={tx.id} transaction={tx} />
          ))
        ) : (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            No pending transactions in mempool
          </div>
        )}
      </div>
    </div>
  );
}
