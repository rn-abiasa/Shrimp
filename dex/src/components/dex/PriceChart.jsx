import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { usePools, useTokenHistory } from "@/hooks/useData";
import { RefreshCw } from "lucide-react";

const MOCK_HISTORICAL_DATA = [
  { time: "10:00", value: 1.0001 },
  { time: "11:00", value: 1.0003 },
  { time: "12:00", value: 1.0002 },
  { time: "13:00", value: 1.0005 },
  { time: "14:00", value: 1.0004 },
  { time: "15:00", value: 1.0007 },
  { time: "16:00", value: 1.0006 },
];

export default function PriceChart({ token }) {
  const { data: historyData, isLoading } = useTokenHistory(token?.address);
  const { data: pools } = usePools();

  const chartData = useMemo(() => {
    let rawData = [];

    // 1. If real binary history exists, use ONLY it
    if (historyData?.history && historyData.history.length > 0) {
      rawData = [...historyData.history];
    }

    // 2. Add latest live price from pools
    const pool = pools?.find(
      (p) =>
        p.tokenAddress?.toLowerCase() === token?.address?.toLowerCase() ||
        p.address?.toLowerCase() === token?.address?.toLowerCase() ||
        (token?.address === "native" && p.symbol === "native"),
    );

    if (pool && pool.tokenReserve > 0n) {
      const livePrice =
        Number((pool.shrimpReserve * 1000000000000n) / pool.tokenReserve) /
        1000000000000;
      const nowLabel = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const last = rawData[rawData.length - 1];
      if (!last || last.value !== livePrice) {
        rawData.push({
          time: nowLabel,
          value: livePrice,
          timestamp: Date.now(),
        });
      }
    }

    // 3. Fallback to mock data ONLY if we still have ABSOLUTELY nothing
    if (rawData.length === 0) {
      rawData = [...MOCK_HISTORICAL_DATA];
    }

    // 4. Ensure at least 2 points for a line
    if (rawData.length === 1) {
      const p = rawData[0];
      return [
        { ...p, time: "Start" },
        { ...p, time: "Now" },
      ];
    }

    return rawData;
  }, [historyData, token, pools]);

  const currentPrice = useMemo(() => {
    if (!chartData || chartData.length === 0) return 0;
    return chartData[chartData.length - 1].value;
  }, [chartData]);

  const formattedPrice = useMemo(() => {
    if (currentPrice === 0) return "0.000000";
    if (currentPrice < 0.000001) return currentPrice.toExponential(4);
    return currentPrice.toFixed(6);
  }, [currentPrice]);

  const priceChange = useMemo(() => {
    if (!chartData || chartData.length < 2) return "0.0";

    const startValue = chartData[0].value;
    const endValue = chartData[chartData.length - 1].value;

    if (startValue === 0) {
      return endValue > 0 ? "100.0" : "0.0";
    }

    const change = ((endValue - startValue) / startValue) * 100;

    if (Math.abs(change) < 0.1 && change !== 0) return change.toFixed(3);
    return change.toFixed(1);
  }, [chartData]);

  const isPositive = parseFloat(priceChange) >= 0;
  const chartColor = isPositive ? "#22c55e" : "#ef4444";
  const gradientId = useMemo(
    () => `colorValue-${token?.address || "native"}`,
    [token],
  );

  if (isLoading) {
    return (
      <div className="h-[280px] w-full flex items-center justify-center bg-muted/10 rounded-3xl border border-dashed border-border">
        <div className="flex flex-col items-center gap-2">
          <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Sampling Chain...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-2xl font-bold font-mono tracking-tight">
            {formattedPrice}{" "}
            <span
              className={`text-sm ml-1 ${isPositive ? "text-green-500" : "text-red-500"}`}
            >
              {isPositive ? "+" : ""}
              {priceChange}%
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
            {token?.symbol} / SHRIMP
          </div>
        </div>
        <div className="flex gap-1">
          {["1H", "1D", "1W", "1M", "ALL"].map((p) => (
            <button
              key={p}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${p === "1D" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div
        className="w-full bg-black/40 rounded-3xl border border-white/5 overflow-hidden p-6 relative"
        style={{ height: "300px", minHeight: "300px" }}
      >
        {/* Debug Status Overlay */}
        <div className="absolute top-2 right-4 flex gap-3 z-10">
          <span className="text-[9px] font-mono text-white/20 uppercase">
            Points: {chartData?.length || 0}
          </span>
          <span className="text-[9px] font-mono text-white/20 uppercase">
            Last: {formattedPrice}
          </span>
        </div>

        {!chartData || chartData.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center">
            <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest animate-pulse">
              No Data Available
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 20, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="4 4"
                stroke="rgba(255,255,255,0.1)"
                vertical={false}
              />
              <XAxis dataKey="time" hide={true} />
              <YAxis
                hide={true}
                domain={["auto", "auto"]}
                padding={{ top: 40, bottom: 40 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: "12px",
                  fontSize: "12px",
                  color: "#fff",
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={chartColor}
                strokeWidth={4}
                fill={chartColor}
                fillOpacity={0.15}
                animationDuration={500}
                isAnimationActive={false} // Disable animation for pure visibility test
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
