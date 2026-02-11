import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { HashDisplay } from "../components/common/HashDisplay";
import { TransactionCard } from "../components/transactions/TransactionCard";
import { formatCurrency } from "../lib/utils";
import { ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";

export function Address() {
  const { address } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["address", address],
    queryFn: () => api.getAddress(address),
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="h-96 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold">Address not found</h1>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <Link to="/">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>
      </Link>

      <h1 className="text-3xl font-bold">Address Details</h1>

      <Card>
        <CardHeader>
          <CardTitle>Address Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Balance</div>
              <div className="text-2xl font-bold">
                {formatCurrency(data.balance)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">
                Total Transactions
              </div>
              <div className="text-2xl font-bold">{data.transactionCount}</div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <div className="text-sm text-muted-foreground mb-1">Address</div>
            <HashDisplay hash={data.address} length={16} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold">
          Transactions ({data.transactions?.length || 0})
        </h2>
        {data.transactions && data.transactions.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.transactions.map((tx) => (
              <TransactionCard key={tx.id} transaction={tx} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No transactions found for this address
          </div>
        )}
      </div>
    </div>
  );
}
