import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { TransactionCard } from "../components/transactions/TransactionCard";
import { Button } from "../components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Transactions() {
  const [page, setPage] = useState(0);
  const limit = 12;

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", limit, page * limit],
    queryFn: () => api.getTransactions(limit, page * limit),
    refetchInterval: 10000,
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Transactions</h1>
        <div className="text-sm text-muted-foreground">
          Total: {data?.total || 0} transactions
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: limit }).map((_, i) => (
              <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />
            ))
          : data?.transactions.map((tx) => (
              <TransactionCard key={tx.id} transaction={tx} />
            ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
