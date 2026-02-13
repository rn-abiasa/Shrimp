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
import { useTokenHistory } from "@/hooks/useData";
import { RefreshCw } from "lucide-react";

const MOCK_HISTORICAL_DATA = [
  { time: "10:00", value: 1.0 },
  { time: "11:00", value: 1.0 },
  { time: "12:00", value: 1.0 },
  { time: "13:00", value: 1.0 },
  { time: "14:00", value: 1.0 },
  { time: "15:00", value: 1.0 },
  { time: "16:00", value: 1.0 },
];

export default function PriceChart({ token }) {
  const { data: historyData, isLoading } = useTokenHistory(token?.address);

  const chartData = useMemo(() => {
    if (token?.address === "native") return MOCK_HISTORICAL_DATA;
    if (historyData?.history && historyData.history.length > 0) {
      return historyData.history;
    }
    return MOCK_HISTORICAL_DATA;
  }, [historyData, token]);

  const currentPrice = useMemo(() => {
    if (chartData.length === 0) return 0;
    return chartData[chartData.length - 1].value;
  }, [chartData]);

  const priceChange = useMemo(() => {
    if (chartData.length < 2) return 0;
    const start = chartData[0].value;
    const end = chartData[chartData.length - 1].value;
    if (start === 0) return 0;
    return (((end - start) / start) * 100).toFixed(1);
  }, [chartData]);

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
            {currentPrice.toFixed(6)}{" "}
            <span
              className={`text-sm ml-1 ${parseFloat(priceChange) >= 0 ? "text-green-500" : "text-red-500"}`}
            >
              {parseFloat(priceChange) >= 0 ? "+" : ""}
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
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0.5}
                />
                <stop
                  offset="60%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0.1}
                />
                <stop
                  offset="100%"
                  stopColor="hsl(var(--primary))"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.15}
              vertical={false}
            />
            <XAxis
              dataKey="time"
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              dy={10}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              hide
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "16px",
                fontSize: "12px",
                fontWeight: "700",
                boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
              }}
              cursor={{
                stroke: "hsl(var(--primary))",
                strokeWidth: 2,
                strokeDasharray: "4 4",
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              fillOpacity={1}
              fill="url(#colorValue)"
              strokeWidth={3}
              animationDuration={1500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
