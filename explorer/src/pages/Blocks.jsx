import { useState, Fragment, React } from "react";
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
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Box,
  Hash,
  User,
  Activity,
  Calendar,
} from "lucide-react";
import { HashDisplay } from "../components/common/HashDisplay";
import { TimeAgo } from "../components/common/TimeAgo";

export function Blocks() {
  const [page, setPage] = useState(0);
  const [expandedBlock, setExpandedBlock] = useState(null);
  const limit = 15;

  const { data, isLoading } = useQuery({
    queryKey: ["blocks", limit, page * limit],
    queryFn: () => api.getBlocks(limit, page * limit),
    refetchInterval: 10000,
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  const toggleExpand = (index) => {
    setExpandedBlock(expandedBlock === index ? null : index);
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Blocks</h1>
        <div className="text-sm text-muted-foreground">
          Total: {data?.total || 0} blocks
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[80px]">?</TableHead>
              <TableHead>Block</TableHead>
              <TableHead>Hash</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead className="text-right">Transactions</TableHead>
              <TableHead className="text-right">Difficulty</TableHead>
              <TableHead className="w-[100px] text-center">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-muted animate-pulse rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data?.blocks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No blocks found.
                </TableCell>
              </TableRow>
            ) : (
              data?.blocks.map((block, index) => (
                <Fragment key={block.index}>
                  <TableRow className="group hover:bg-accent/50 transition-colors">
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      <Box size={16} />
                    </TableCell>
                    <TableCell className="font-bold">
                      <Link
                        to={`/block/${block.index}`}
                        className="text-primary hover:underline flex items-center gap-2"
                      >
                        #{block.index}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <HashDisplay hash={block.hash} length={8} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      <TimeAgo timestamp={block.timestamp} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {block.transactionCount} tx
                      {block.transactionCount !== 1 ? "s" : ""}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {block.difficulty}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpand(block.index)}
                        className="h-8 w-8 p-0"
                      >
                        {expandedBlock === block.index ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedBlock === block.index && (
                    <TableRow className="bg-muted/30 border-b-2 border-primary/20 animate-in fade-in slide-in-from-top-1 duration-200">
                      <TableCell colSpan={7} className="p-0">
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div className="flex items-start gap-4">
                              <div className="p-2 rounded-lg bg-background border shadow-sm mt-1">
                                <Hash className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="space-y-1">
                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                  Full Block Hash
                                </div>
                                <div className="text-xs font-mono break-all bg-background p-2 rounded border">
                                  {block.hash}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-start gap-4">
                              <div className="p-2 rounded-lg bg-background border shadow-sm mt-1">
                                <Hash className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="space-y-1">
                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                  Parent Hash
                                </div>
                                <div className="text-xs text-black font-mono break-all bg-background p-2 rounded border">
                                  {block.lastHash}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="flex items-start gap-4">
                              <div className="p-2 rounded-lg bg-background border shadow-sm mt-1">
                                <User className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="space-y-1">
                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                  Mined By
                                </div>
                                <div className="text-xs font-mono break-all bg-background p-2 rounded border">
                                  {block.miner || "N/A"}
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex items-start gap-4">
                                <div className="p-2 rounded-lg bg-background border shadow-sm mt-1">
                                  <Activity className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="space-y-1">
                                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    Nonce
                                  </div>
                                  <div className="text-xs font-mono p-2 bg-background rounded border">
                                    {block.nonce}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-start gap-4">
                                <div className="p-2 rounded-lg bg-background border shadow-sm mt-1">
                                  <Calendar className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="space-y-1">
                                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    Exact Time
                                  </div>
                                  <div className="text-xs p-2 bg-background rounded border">
                                    {new Date(block.timestamp).toLocaleString()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
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
