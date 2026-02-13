import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { api } from "../../lib/api";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const result = await api.search(query.trim());

      switch (result.type) {
        case "block":
          navigate(`/block/${result.id}`);
          break;
        case "transaction":
          navigate(`/transaction/${result.id}`);
          break;
        case "address":
          navigate(`/address/${result.id}`);
          break;
        case "contract":
          navigate(`/contract/${result.id}`);
          break;
        default:
          alert("No results found");
      }

      setQuery("");
    } catch (error) {
      alert("No results found");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <form onSubmit={handleSearch} className="relative flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by block, tx hash, or address..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
          disabled={isSearching}
        />
      </div>
      <Button type="submit" size="sm" disabled={isSearching || !query.trim()}>
        {isSearching ? "Searching..." : "Search"}
      </Button>
    </form>
  );
}
