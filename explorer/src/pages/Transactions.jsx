import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { ChevronLeft, ChevronRight, ArrowRightLeft, Coins } from "lucide-react";
import { HashDisplay } from "../components/common/HashDisplay";
import { TimeAgo } from "../components/common/TimeAgo";
import { formatCurrency } from "../lib/utils";

export function Transactions() {
  const [page, setPage] = useState(0);
  const limit = 15;

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", limit, page * limit],
    queryFn: () => api.getTransactions(limit, page * limit),
    refetchInterval: 10000,
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  const calculateFee = (tx) => {
    if (tx.method === "Mining Reward") return "0";
    const from = tx.input?.address;
    if (!from) return "0";

    const inputAmount = BigInt(tx.input.amount);
    const outputTotal = Object.values(tx.outputMap).reduce(
      (sum, amount) => sum + BigInt(amount),
      0n,
    );

    const feeBI = inputAmount - outputTotal;
    return feeBI > 0n ? feeBI.toString() : "0";
  };

  const getRecipient = (tx) => {
    const from = tx.input?.address;
    const recipients = Object.keys(tx.outputMap || {}).filter(
      (addr) => addr !== from,
    );
    return recipients[0] || from;
  };

  const getTotalAmount = (tx) => {
    const from = tx.input?.address;
    const recipients = Object.keys(tx.outputMap || {}).filter(
      (addr) => addr !== from,
    );
    return recipients.reduce(
      (sum, addr) => sum + BigInt(tx.outputMap[addr]),
      0n,
    );
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Transactions</h1>
        <div className="text-sm text-muted-foreground">
          Total: {data?.total || 0} transactions
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>No</TableHead>
              <TableHead className="w-[180px]">Transaction Hash</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Block</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>From</TableHead>
              <TableHead></TableHead>
              <TableHead>To</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Trx Fee</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-muted animate-pulse rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  No transactions found.
                </TableCell>
              </TableRow>
            ) : (
              data?.transactions.map((tx, index) => (
                <TableRow
                  key={tx.id}
                  className="group hover:bg-accent/50 transition-colors"
                >
                  <TableCell>{index + 1}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <Link
                      to={`/transaction/${tx.id}`}
                      className="text-primary hover:underline"
                    >
                      <HashDisplay hash={tx.id} length={6} />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        tx.method === "Mining Reward" ? "secondary" : "outline"
                      }
                      className="gap-1"
                    >
                      {tx.method === "Mining Reward" ? (
                        <Coins className="h-3 w-3" />
                      ) : (
                        <ArrowRightLeft className="h-3 w-3" />
                      )}
                      {tx.method}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/block/${tx.blockIndex}`}
                      className="text-primary hover:underline"
                    >
                      #{tx.blockIndex}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {tx.timestamp ? (
                      <TimeAgo timestamp={tx.timestamp} />
                    ) : (
                      "Pending"
                    )}
                  </TableCell>
                  <TableCell>
                    {tx.method === "Mining Reward" ? (
                      <Badge
                        variant="outline"
                        className="bg-muted/50 border-none font-medium"
                      >
                        System
                      </Badge>
                    ) : (
                      <HashDisplay hash={tx.input?.address} length={5} />
                    )}
                  </TableCell>
                  <TableCell>
                    <ArrowRightLeft className="h-3 w-3 text-muted-foreground opacity-50" />
                  </TableCell>
                  <TableCell>
                    <HashDisplay hash={getRecipient(tx)} length={5} />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(getTotalAmount(tx))}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs">
                    {formatCurrency(calculateFee(tx))}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium px-4 py-2 bg-muted rounded-lg border">
              {page + 1}
            </span>
            <span className="text-sm text-muted-foreground mx-1">of</span>
            <span className="text-sm font-medium px-4 py-2 rounded-lg border">
              {totalPages}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-lg"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
