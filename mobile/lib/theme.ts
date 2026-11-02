import { useColorScheme } from "react-native";

const light = {
  bg: "#f7f7fb",
  card: "#ffffff",
  text: "#14141f",
  muted: "#6b6b80",
  border: "#e6e6ef",
  primary: "#6e5cf0",
  primaryText: "#ffffff",
  danger: "#dc2626",
  warnBg: "#fef3c7",
  warnText: "#78350f",
  busy: "#94a3b8",
  now: "#ef4444",
};

const dark: typeof light = {
  bg: "#0b0b12",
  card: "#16161f",
  text: "#f2f2f7",
  muted: "#9a9ab0",
  border: "#2a2a38",
  primary: "#8b7bff",
  primaryText: "#ffffff",
  danger: "#f87171",
  warnBg: "#422006",
  warnText: "#fde68a",
  busy: "#64748b",
  now: "#f87171",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

/** One stable accent per event type, matching the website's palette. */
const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#ef4444"];
export function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
