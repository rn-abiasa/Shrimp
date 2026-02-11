import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { HashDisplay } from "../components/common/HashDisplay";
import { formatTimestamp, formatCurrency } from "../lib/utils";
import { ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";

export function TransactionDetail() {
  const { id } = useParams();

  const { data: tx, isLoading } = useQuery({
    queryKey: ["transaction", id],
    queryFn: () => api.getTransaction(id),
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="h-96 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold">Transaction not found</h1>
      </div>
    );
  }

  const from = tx.input?.address;
  const outputs = tx.outputMap || {};
  const recipients = Object.entries(outputs);
  const totalOutput = recipients.reduce((sum, [, amount]) => sum + amount, 0);
  const fee = tx.input?.amount ? tx.input.amount - totalOutput : 0;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <Link to="/transactions">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Transactions
        </Button>
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">Transaction Details</h1>
        <Badge variant={tx.status === "confirmed" ? "default" : "secondary"}>
          {tx.status || "confirmed"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tx.blockIndex !== undefined && (
              <div>
                <div className="text-sm text-muted-foreground">Block</div>
                <Link
                  to={`/block/${tx.blockIndex}`}
                  className="font-semibold hover:underline"
                >
                  #{tx.blockIndex}
                </Link>
              </div>
            )}
            {tx.timestamp && (
              <div>
                <div className="text-sm text-muted-foreground">Timestamp</div>
                <div className="font-semibold">
                  {formatTimestamp(tx.timestamp)}
                </div>
              </div>
            )}
            <div>
              <div className="text-sm text-muted-foreground">Total Amount</div>
              <div className="font-semibold">{formatCurrency(totalOutput)}</div>
            </div>
            {fee > 0 && (
              <div>
                <div className="text-sm text-muted-foreground">Fee</div>
                <div className="font-semibold">{formatCurrency(fee)}</div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t space-y-2">
            <div>
              <div className="text-sm text-muted-foreground mb-1">
                Transaction ID
              </div>
              <HashDisplay hash={tx.id} length={16} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>From</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <HashDisplay hash={from} length={12} />
            <div className="font-semibold">
              {formatCurrency(tx.input?.amount)}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>To ({recipients.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recipients.map(([address, amount]) => (
            <div
              key={address}
              className="flex items-center justify-between py-2 border-b last:border-0"
            >
              <HashDisplay hash={address} length={12} />
              <div className="font-semibold">{formatCurrency(amount)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
