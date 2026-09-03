import { apiFetch } from "@/lib/api";

export interface PricingInfo {
  enabled: boolean;
  founder_price_cents: number | null;
  standard_price_cents: number;
  currency: string;
  founder_seats: number;
  founder_seats_left: number;
}

export interface BillingStatus {
  enabled: boolean;
  entitled: boolean;
  status: string;
  plan: "founder" | "standard" | null;
  current_period_end: string | null;
  has_customer: boolean;
}

export function fetchPricing(): Promise<PricingInfo> {
  return apiFetch<PricingInfo>("/api/billing/pricing");
}

export function fetchBillingStatus(token: string | null): Promise<BillingStatus> {
  return apiFetch<BillingStatus>("/api/billing/status", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function startCheckout(token: string | null): Promise<string> {
  const { url } = await apiFetch<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return url;
}

export async function openPortal(token: string | null): Promise<string> {
  const { url } = await apiFetch<{ url: string }>("/api/billing/portal", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return url;
}

export function fmtCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export const PLAN_LABEL: Record<string, string> = {
  founder: "Founding member",
  standard: "Standard",
};
