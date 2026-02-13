import { Link } from "react-router-dom";
import { SearchBar } from "./SearchBar";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-xl">
          <span className="hidden sm:inline">ShrimpScanner</span>
          <span className="sm:hidden">Shrimp</span>
        </Link>

        <div className="flex-1 max-w-xl mx-4">
          <SearchBar />
        </div>

        <nav className="flex items-center gap-2 md:gap-4 text-sm">
          <Link
            to="/blocks"
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            Blocks
          </Link>
          <Link
            to="/transactions"
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            Transactions
          </Link>
          <Link
            to="/mempool"
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            Mempool
          </Link>
          <Link
            to="/contracts"
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            Contracts
          </Link>
          <Link
            to="/holders"
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            Holders
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
