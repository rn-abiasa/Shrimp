export const TOKENS = [
  {
    symbol: "SHRIMP",
    name: "Shrimp Coin",
    icon: "🦐",
    address: "native",
    decimals: 8,
    price: 1.25,
    change: +5.4,
  },
  {
    symbol: "USDS",
    name: "Shrimp Stable",
    icon: "💵",
    address: "0x123...abc",
    decimals: 6,
    price: 1.0,
    change: 0.0,
  },
  {
    symbol: "BABY",
    name: "Baby Shrimp",
    icon: "👶",
    address: "0x456...def",
    decimals: 8,
    price: 0.0045,
    change: -2.1,
  },
  {
    symbol: "KING",
    name: "King Prawn",
    icon: "👑",
    address: "0x789...ghi",
    decimals: 18,
    price: 450.0,
    change: +12.8,
  },
];

export const MOCK_CHART_DATA = Array.from({ length: 24 }, (_, i) => ({
  time: `${i}:00`,
  price: 1.2 + Math.random() * 0.1,
}));
