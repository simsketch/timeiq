export const BOOKING_CURRENCIES = ["usd", "eur", "gbp", "cad", "aud", "nzd", "chf", "sgd", "hkd"];

export function bookingPrice(cents: number, currency: string, locale = "en") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

export interface ConnectStatus {
  enabled: boolean;
  status: "not_connected" | "needs_info" | "ready";
  charges_enabled: boolean;
  payouts_enabled: boolean;
}
