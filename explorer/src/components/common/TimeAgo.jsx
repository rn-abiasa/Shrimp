import { timeAgo, formatTimestamp } from "../../lib/utils";

export function TimeAgo({ timestamp }) {
  if (!timestamp) return <span className="text-muted-foreground">N/A</span>;

  return (
    <span className="text-sm" title={formatTimestamp(timestamp)}>
      {timeAgo(timestamp)}
    </span>
  );
}
