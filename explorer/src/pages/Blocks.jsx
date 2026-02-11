import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { BlockCard } from "../components/blocks/BlockCard";
import { Button } from "../components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Blocks() {
  const [page, setPage] = useState(0);
  const limit = 12;

  const { data, isLoading } = useQuery({
    queryKey: ["blocks", limit, page * limit],
    queryFn: () => api.getBlocks(limit, page * limit),
    refetchInterval: 10000,
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Blocks</h1>
        <div className="text-sm text-muted-foreground">
          Total: {data?.total || 0} blocks
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? Array.from({ length: limit }).map((_, i) => (
              <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />
            ))
          : data?.blocks.map((block) => (
              <BlockCard key={block.index} block={block} />
            ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
