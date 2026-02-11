import { Link } from "react-router-dom";
import { Blocks } from "lucide-react";
import { SearchBar } from "./SearchBar";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2 font-bold text-xl">
          <Blocks className="h-6 w-6" />
          <span className="hidden sm:inline">ShrimpChain Explorer</span>
          <span className="sm:hidden">Shrimp</span>
        </Link>

        <div className="flex-1 max-w-xl mx-4">
          <SearchBar />
        </div>

        <nav className="flex items-center gap-2 md:gap-4 text-sm">
          <Link
            to="/blocks"
            className="hover:text-primary transition-colors hidden md:inline"
          >
            Blocks
          </Link>
          <Link
            to="/transactions"
            className="hover:text-primary transition-colors hidden md:inline"
          >
            Transactions
          </Link>
          <Link
            to="/mempool"
            className="hover:text-primary transition-colors hidden md:inline"
          >
            Mempool
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
