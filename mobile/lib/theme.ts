import { useColorScheme } from "react-native";

const light = {
  bg: "#f4f5f6",
  card: "#ffffff",
  text: "#141414",
  muted: "#62656b",
  border: "#e4e5e7",
  primary: "#e0540a",
  primaryText: "#ffffff",
  danger: "#dc2626",
  warnBg: "#fef3c7",
  warnText: "#78350f",
  busy: "#94a3b8",
  now: "#ef4444",
};

const dark: typeof light = {
  bg: "#0b0b0c",
  card: "#17171a",
  text: "#f2f2f3",
  muted: "#9c9ea3",
  border: "#2a2a2e",
  primary: "#ff7a2e",
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
