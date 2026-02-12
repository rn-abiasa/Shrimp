import { useNetworkStats } from "@/hooks/useData";
import { Blocks, ArrowRightLeft, Clock, ShieldCheck } from "lucide-react";

export default function NetworkStats() {
  const { data: stats, isLoading } = useNetworkStats();

  const items = [
    {
      title: "Block Height",
      value: stats?.height || "0",
      icon: Blocks,
      color: "text-blue-500",
    },
    {
      title: "Total TXs",
      value: stats?.totalTransactions || "0",
      icon: ArrowRightLeft,
      color: "text-pink-500",
    },
    {
      title: "Mempool",
      value: stats?.mempoolSize || "0",
      icon: Clock,
      color: "text-orange-500",
    },
    {
      title: "Network Status",
      value: "Syncing",
      icon: ShieldCheck,
      color: "text-green-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((item, i) => (
        <div
          key={i}
          className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/50 backdrop-blur-md hover:border-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`p-1.5 rounded-lg bg-slate-950 border border-slate-800 ${item.color}`}
            >
              <item.icon className="h-3.5 w-3.5" />
            </div>
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.1em]">
              {item.title}
            </span>
          </div>
          <div
            className={`text-2xl font-black ${isLoading ? "animate-pulse" : ""} tracking-tight`}
          >
            {isLoading ? "..." : item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
