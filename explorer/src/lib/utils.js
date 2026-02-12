import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatHash(hash, length = 8) {
  if (!hash) return "";
  if (hash.length <= length * 2) return hash;
  return `${hash.slice(0, length)}...${hash.slice(-length)}`;
}

export function formatAddress(address, length = 6) {
  if (!address) return "";
  if (address.length <= length * 2) return address;
  return `${address.slice(0, length)}...${address.slice(-length)}`;
}

export function formatNumber(num) {
  if (num === undefined || num === null) return "0";
  try {
    // Handle BigInt or String representation of large integers
    if (
      typeof num === "bigint" ||
      (typeof num === "string" && /^-?\d+$/.test(num))
    ) {
      return BigInt(num).toLocaleString("en-US");
    }
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(Number(num));
  } catch (e) {
    return String(num);
  }
}

export function formatCurrency(num) {
  if (num === undefined || num === null) return "0 SHRIMP";
  // Convert base units (10^8) to main unit
  // Use Number for display precision (safe up to 2^53 - 1 which is ~9 quadrillion > 2.1 quadrillion max supply)
  let val = num;
  try {
    // If BigInt or string representation of large int or regular number
    // We treat ALL inputs as Base Units (Satoshis)
    if (
      typeof num === "bigint" ||
      (typeof num === "string" && /^-?\d+$/.test(num)) ||
      typeof num === "number"
    ) {
      val = Number(BigInt(num)) / 100000000;
    }
  } catch (e) {
    val = Number(num) / 100000000;
  }

  return `${formatNumber(val)} SHRIMP`;
}

export function formatTimestamp(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleString();
}

export function timeAgo(timestamp) {
  if (!timestamp) return "";
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return `${seconds} second${seconds !== 1 ? "s" : ""} ago`;
}
