import { Link, useLocation } from "react-router-dom";
import {
  Waves,
  ArrowRightLeft,
  Droplets,
  LayoutDashboard,
  Coins,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { WalletManager } from "../dex/WalletManager";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { name: "Swap", path: "/", icon: ArrowRightLeft },
    { name: "Tokens", path: "/tokens", icon: Coins },
    { name: "Pools", path: "/pools", icon: Droplets },
    { name: "Explorer", path: "/explorer", icon: LayoutDashboard },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-800/60 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="relative">
                <div className="absolute -inset-1 bg-pink-500 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative h-8 w-8 bg-slate-900 rounded-lg flex items-center justify-center border border-slate-700">
                  <Waves className="h-5 w-5 text-pink-500" />
                </div>
              </div>
              <span className="text-xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                SHRIMP<span className="text-pink-500">DEX</span>
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    location.pathname === item.path
                      ? "bg-slate-900 text-pink-500 border border-slate-800 shadow-lg shadow-pink-500/5"
                      : "text-muted-foreground hover:text-white hover:bg-slate-900/50"
                  }`}
                >
                  <item.icon
                    className={`h-4 w-4 ${location.pathname === item.path ? "text-pink-500" : ""}`}
                  />
                  {item.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <WalletManager />
            </div>

            <button
              className="md:hidden p-2 rounded-lg hover:bg-slate-900"
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
        <div className="md:hidden bg-background border-b border-slate-800 py-4 animate-in slide-in-from-top duration-300">
          <div className="container mx-auto px-4 flex flex-col gap-2">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl ${
                  location.pathname === item.path
                    ? "bg-slate-900 text-pink-500"
                    : "text-muted-foreground"
                }`}
                onClick={() => setIsOpen(false)}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            ))}
            <div className="pt-2 border-t border-slate-800 mt-2">
              <WalletManager />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
