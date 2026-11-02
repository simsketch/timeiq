import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; clerkPublishableKey?: string };

export const API_URL = process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || "https://api.timeiq.app";
export const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || extra.clerkPublishableKey || "";
export const SITE_URL = "https://timeiq.app";
