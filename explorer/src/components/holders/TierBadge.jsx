import { cn } from "@/lib/utils";

const tierConfig = {
  shrimp: {
    name: "Shrimp",
    icon: "🦐",
    gradient: "from-gray-500 to-gray-600",
    bg: "bg-gray-500/10",
    border: "border-gray-500/20",
    text: "text-gray-300",
  },
  fish: {
    name: "Fish",
    icon: "🐟",
    gradient: "from-blue-500 to-blue-600",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    text: "text-blue-300",
  },
  shark: {
    name: "Shark",
    icon: "🦈",
    gradient: "from-teal-500 to-teal-600",
    bg: "bg-teal-500/10",
    border: "border-teal-500/20",
    text: "text-teal-300",
  },
  whale: {
    name: "Whale",
    icon: "🐋",
    gradient: "from-purple-500 to-purple-600",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    text: "text-purple-300",
  },
  miner: {
    name: "Miner",
    icon: "⛏️",
    gradient: "from-orange-500 to-orange-600",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    text: "text-orange-300",
  },
  king: {
    name: "King",
    icon: "👑",
    gradient: "from-yellow-400 via-yellow-500 to-amber-600",
    bg: "bg-gradient-to-r from-yellow-500/10 to-amber-500/10",
    border: "border-yellow-500/30",
    text: "text-yellow-300",
  },
};

export function TierBadge({ tier, showName = true, size = "md" }) {
  const config = tierConfig[tier] || tierConfig.shrimp;

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-3 py-1",
    lg: "text-base px-4 py-1.5",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        config.bg,
        config.border,
        config.text,
        sizeClasses[size],
      )}
    >
      <span className="text-base">{config.icon}</span>
      {showName && <span>{config.name}</span>}
    </div>
  );
}

export function TierProgress({ tier }) {
  const config = tierConfig[tier] || tierConfig.shrimp;

  return (
    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div
        className={cn(
          "h-full bg-gradient-to-r transition-all duration-500",
          config.gradient,
        )}
        style={{ width: "100%" }}
      />
    </div>
  );
}
