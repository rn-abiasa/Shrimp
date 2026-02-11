import { Card, CardContent } from "@/components/ui/card";
import { TierBadge } from "./TierBadge";
import { CopyButton } from "../common/CopyButton";
import { HashDisplay } from "../common/HashDisplay";
import { Link } from "react-router-dom";

export function HolderCard({ holder, rank }) {
  return (
    <Card className="hover:border-primary/50 transition-all duration-200 group">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold">
              #{rank}
            </div>
            <TierBadge tier={holder.tier} />
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-foreground">
              {holder.balance.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground">SHRIMP</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Address</span>
            <div className="flex items-center gap-2">
              <Link
                to={`/address/${holder.address}`}
                className="text-sm font-mono text-primary hover:underline"
              >
                <HashDisplay hash={holder.address} length={12} />
              </Link>
              <CopyButton text={holder.address} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">% of Supply</span>
            <span className="text-sm font-medium text-foreground">
              {holder.percentage}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
