import SwapCard from "@/components/dex/SwapCard";
import PriceChart from "@/components/dex/PriceChart";
import TokenOverview from "@/components/dex/TokenOverview";
import NetworkStats from "@/components/dex/NetworkStats";
import { useTokens } from "@/hooks/useData";
import { motion } from "framer-motion";

export default function SwapPage() {
  const { data: tokens } = useTokens();
  const activeToken = tokens?.[0] || {
    symbol: "SHRIMP",
    name: "Shrimp Coin",
    icon: "🦐",
    price: 1.25,
    change: 0,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight">
            Shrimp<span className="text-pink-500">Swap</span>
          </h1>
          <p className="text-muted-foreground text-lg">
            Instant yields, zero friction on ShrimpChain.
          </p>
        </div>
        <div className="hidden md:flex gap-4 bg-slate-900/50 p-1.5 rounded-xl border border-slate-800">
          <button className="px-6 py-2 text-sm font-bold bg-pink-500 text-white rounded-lg shadow-lg shadow-pink-500/20">
            Market
          </button>
          <button className="px-6 py-2 text-sm font-bold text-muted-foreground hover:text-white transition-colors">
            Limit
          </button>
        </div>
      </div>

      <NetworkStats />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-8 space-y-8"
        >
          <PriceChart token={activeToken} />
          <TokenOverview />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-4 flex justify-center lg:justify-end"
        >
          <SwapCard />
        </motion.div>
      </div>
    </div>
  );
}
