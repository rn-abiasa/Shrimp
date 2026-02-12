import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const MOCK_HISTORICAL_DATA = [
  { time: "10:00", value: 0.12 },
  { time: "11:00", value: 0.15 },
  { time: "12:00", value: 0.14 },
  { time: "13:00", value: 0.18 },
  { time: "14:00", value: 0.22 },
  { time: "15:00", value: 0.2 },
  { time: "16:00", value: 0.25 },
];

export default function PriceChart({ token }) {
  return (
    <Card className="bg-background/40 backdrop-blur-md border-slate-800 h-[400px]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{token.icon}</span>
          <div>
            <CardTitle className="text-slate-100">
              {token.symbol} / SHRIMP
            </CardTitle>
            <div className="text-sm text-muted-foreground">{token.name}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[300px] w-full pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={MOCK_HISTORICAL_DATA}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#1e293b"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: "8px",
              }}
              itemStyle={{ color: "#ec4899" }}
              labelStyle={{ color: "#64748b" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#ec4899"
              fillOpacity={1}
              fill="url(#colorValue)"
              strokeWidth={3}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
