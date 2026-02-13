import { Link, useLocation } from "react-router-dom";
import {
  ArrowRightLeft,
  Droplets,
  LayoutDashboard,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { WalletDropdown } from "../dex/WalletDropdown";
import ThemeToggle from "./ThemeToggle";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { name: "Swap", path: "/", icon: ArrowRightLeft },
    { name: "Explore", path: "/explore", icon: LayoutDashboard },
    { name: "Pool", path: "/pools", icon: Droplets },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto px-4 md:px-6">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 group">
              <span className="text-xl font-bold tracking-tight">
                SHRIMP
                <span className="text-muted-foreground font-medium">DEX</span>
              </span>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  location.pathname === item.path
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-3">
              <ThemeToggle />
              <div className="h-4 w-px bg-border mx-1" />
              <WalletDropdown />
            </div>

            <button
              className="md:hidden p-2 rounded-xl hover:bg-muted"
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-background border-b border-border py-4 animate-in slide-in-from-top duration-300">
          <div className="px-4 flex flex-col gap-2">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
                  location.pathname === item.path
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
                onClick={() => setIsOpen(false)}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            ))}
            <div className="pt-4 border-t border-border mt-2 flex items-center justify-between px-2">
              <ThemeToggle />
              <WalletDropdown />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
