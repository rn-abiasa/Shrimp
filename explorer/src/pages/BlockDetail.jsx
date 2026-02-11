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
import { formatTimestamp } from "../lib/utils";
import { ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";

export function BlockDetail() {
  const { id } = useParams();

  const { data: block, isLoading } = useQuery({
    queryKey: ["block", id],
    queryFn: () => api.getBlock(id),
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="h-96 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!block) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold">Block not found</h1>
      </div>
    );
  }

  const transactions = block.data || [];
  const miner = transactions.find(
    (tx) => tx.input?.address === "*authorized-reward*",
  );
  const minerAddress = miner ? Object.keys(miner.outputMap)[0] : null;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <Link to="/blocks">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Blocks
        </Button>
      </Link>

      <h1 className="text-3xl font-bold">Block #{block.index}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Block Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Block Height</div>
              <div className="font-semibold">{block.index}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Timestamp</div>
              <div className="font-semibold">
                {formatTimestamp(block.timestamp)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Transactions</div>
              <div className="font-semibold">{transactions.length}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Difficulty</div>
              <div className="font-semibold">{block.difficulty}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Nonce</div>
              <div className="font-semibold">{block.nonce}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Miner</div>
              {minerAddress ? (
                <HashDisplay hash={minerAddress} length={8} />
              ) : (
                <span className="text-muted-foreground">N/A</span>
              )}
            </div>
          </div>

          <div className="pt-4 border-t space-y-2">
            <div>
              <div className="text-sm text-muted-foreground mb-1">
                Block Hash
              </div>
              <HashDisplay hash={block.hash} length={16} />
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">
                Previous Hash
              </div>
              <HashDisplay hash={block.lastHash} length={16} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-2xl font-bold">
          Transactions ({transactions.length})
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {transactions.map((tx) => (
            <TransactionCard
              key={tx.id}
              transaction={{
                ...tx,
                blockIndex: block.index,
                timestamp: block.timestamp,
                status: "confirmed",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
