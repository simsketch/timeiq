export const BOOKING_CURRENCIES = ["usd", "eur", "gbp", "cad", "aud", "nzd", "chf", "sgd", "hkd"];

export function bookingPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export const REFUND_POLICY = "Guest cancellations more than 24 hours before the start receive a full refund. Guest cancellations within 24 hours receive no refund. Host cancellations receive a full refund.";

export interface ConnectStatus {
  enabled: boolean;
  status: "not_connected" | "needs_info" | "ready";
  charges_enabled: boolean;
  payouts_enabled: boolean;
}
