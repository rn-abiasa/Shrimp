import { formatHash } from "../../lib/utils";
import { CopyButton } from "./CopyButton";

export function HashDisplay({ hash, length = 8, showCopy = true }) {
  if (!hash) return <span className="text-muted-foreground">N/A</span>;

  return (
    <div className="flex items-center gap-1 font-mono text-sm">
      <span className="truncate">{formatHash(hash, length)}</span>
      {showCopy && <CopyButton text={hash} />}
    </div>
  );
}
