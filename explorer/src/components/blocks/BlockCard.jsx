import { Link } from "react-router-dom";
import { Card, CardContent } from "../ui/card";
import { HashDisplay } from "../common/HashDisplay";
import { TimeAgo } from "../common/TimeAgo";
import { Box } from "lucide-react";

export function BlockCard({ block }) {
  return (
    <Link to={`/block/${block.index}`}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Box className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <div className="font-semibold">Block #{block.index}</div>
                <div className="text-sm text-muted-foreground">
                  <TimeAgo timestamp={block.timestamp} />
                </div>
              </div>
            </div>

            <div className="text-right space-y-1 text-sm">
              <div className="text-muted-foreground">
                {block.transactionCount} tx
                {block.transactionCount !== 1 ? "s" : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                Difficulty: {block.difficulty}
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Hash:</span>
              <HashDisplay hash={block.hash} length={6} />
            </div>
            {block.miner && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Miner:</span>
                <HashDisplay hash={block.miner} length={6} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
