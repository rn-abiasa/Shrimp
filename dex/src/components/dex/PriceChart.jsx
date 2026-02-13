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
    let rawData = [];
    if (token?.address === "native") {
      rawData = MOCK_HISTORICAL_DATA;
    } else if (historyData?.history && historyData.history.length > 0) {
      rawData = historyData.history;
    } else {
      // Return stable mock data as fallback so the chart isn't empty
      return MOCK_HISTORICAL_DATA.map((d) => ({ ...d, value: 1.0 }));
    }

    if (rawData.length === 1) {
      const p = rawData[0];
      // Show a stable line at the current price
      return [
        { ...p, time: "Initial", value: p.value },
        { ...p, time: "Now", value: p.value },
      ];
    }
    return rawData;
  }, [historyData, token]);

  const currentPrice = useMemo(() => {
    if (!chartData || chartData.length === 0) return 0;
    return chartData[chartData.length - 1].value;
  }, [chartData]);

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
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColor} stopOpacity={0.4} />
                <stop offset="60%" stopColor={chartColor} stopOpacity={0.15} />
                <stop offset="100%" stopColor={chartColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.1}
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
              domain={[
                (dataMin) => dataMin * 0.95,
                (dataMax) => dataMax * 1.05,
              ]}
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
                stroke: chartColor,
                strokeWidth: 2,
                strokeDasharray: "4 4",
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={chartColor}
              fillOpacity={1}
              fill="url(#colorValue)"
              strokeWidth={4}
              animationDuration={1500}
              dot={{ r: 2, fill: chartColor, strokeWidth: 0 }}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
