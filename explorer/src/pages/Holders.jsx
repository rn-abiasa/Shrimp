import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TierBadge } from "@/components/holders/TierBadge";
import { Search, Users, Coins } from "lucide-react";
import { HashDisplay } from "@/components/common/HashDisplay";
import { CopyButton } from "@/components/common/CopyButton";
import { Link } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export function Holders() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTier, setSelectedTier] = useState("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["holders"],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/holders`);
      if (!response.ok) throw new Error("Failed to fetch holders");
      return response.json();
    },
    refetchInterval: 2000, // Refetch every 2 seconds for realtime updates
  });

  const filteredHolders = data?.holders?.filter((holder) => {
    const matchesSearch = holder.address
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesTier = selectedTier === "all" || holder.tier === selectedTier;
    return matchesSearch && matchesTier;
  });

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="border-destructive">
          <CardContent className="p-6">
            <p className="text-destructive">
              Error loading holders: {error.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">SHRIMP Holders</h1>
        <p className="text-muted-foreground">
          View all addresses holding SHRIMP tokens and their tier rankings
        </p>
      </div>

      {/* Statistics Cards */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Holders
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data.totalHolders.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Supply
              </CardTitle>
              <Coins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data.totalSupply.toLocaleString()}{" "}
                <span className="text-sm text-muted-foreground">SHRIMP</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Tier Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">
                    🦐 {data.distribution.shrimp}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    🐟 {data.distribution.fish}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    🦈 {data.distribution.shark}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    🐋 {data.distribution.whale}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    ⛏️ {data.distribution.miner}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    👑 {data.distribution.king}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search by address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedTier("all")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedTier === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            All Tiers
          </button>
          {["shrimp", "fish", "shark", "whale", "miner", "king"].map((tier) => (
            <button
              key={tier}
              onClick={() => setSelectedTier(tier)}
              className={`transition-opacity ${
                selectedTier === tier
                  ? "opacity-100"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <TierBadge tier={tier} size="sm" />
            </button>
          ))}
        </div>
      </div>

      {/* Holders Table */}
      <Card>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Rank</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">% Supply</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="h-4 w-8 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="h-6 w-20 bg-muted rounded animate-pulse" />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="h-4 w-24 bg-muted rounded animate-pulse ml-auto" />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="h-4 w-12 bg-muted rounded animate-pulse ml-auto" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredHolders && filteredHolders.length > 0 ? (
                filteredHolders.map((holder, index) => {
                  const rank =
                    data.holders.findIndex(
                      (h) => h.address === holder.address,
                    ) + 1;
                  return (
                    <TableRow key={holder.address}>
                      <TableCell className="font-medium">#{rank}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/address/${holder.address}`}
                            className="text-primary hover:underline font-mono"
                          >
                            <HashDisplay hash={holder.address} length={12} />
                          </Link>
                          <CopyButton text={holder.address} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <TierBadge tier={holder.tier} size="sm" />
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {holder.balance.toLocaleString()} SHRIMP
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {holder.percentage}%
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center h-24 text-muted-foreground"
                  >
                    No holders found matching your criteria
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
