import { Link } from "react-router-dom";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { HashDisplay } from "../common/HashDisplay";
import { TimeAgo } from "../common/TimeAgo";
import { formatCurrency } from "../../lib/utils";
import { ArrowRightLeft } from "lucide-react";

export function TransactionCard({ transaction }) {
  const from = transaction.input?.address;
  const outputs = transaction.outputMap || {};
  const recipients = Object.keys(outputs).filter((addr) => addr !== from);
  const totalAmount = recipients.reduce((sum, addr) => sum + outputs[addr], 0);

  return (
    <Link to={`/transaction/${transaction.id}`}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-2 rounded-lg bg-primary/10">
                <ArrowRightLeft className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm truncate">
                    {transaction.id?.slice(0, 16)}...
                  </span>
                  <Badge
                    variant={
                      transaction.status === "confirmed"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {transaction.status || "confirmed"}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {transaction.timestamp ? (
                    <TimeAgo timestamp={transaction.timestamp} />
                  ) : (
                    "Pending"
                  )}
                </div>
              </div>
            </div>

            <div className="text-right space-y-1">
              <div className="font-semibold text-sm">
                {formatCurrency(totalAmount)}
              </div>
              {transaction.blockIndex !== undefined && (
                <div className="text-xs text-muted-foreground">
                  Block #{transaction.blockIndex}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 pt-3 border-t space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">From:</span>
              <HashDisplay hash={from} length={6} />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">To:</span>
              <HashDisplay hash={recipients[0]} length={6} />
              {recipients.length > 1 && (
                <span className="text-muted-foreground">
                  +{recipients.length - 1} more
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
