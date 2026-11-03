import { useAuth } from "@clerk/expo";
import { useCallback } from "react";
import { API_URL } from "./config";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let synced: string | null = null;

/** Turn FastAPI's error body (a string or a list of field errors) into one line. */
function detailOf(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string; loc?: unknown[] };
    const field = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1]) : "";
    return [field, first.msg].filter(Boolean).join(": ") || fallback;
  }
  return fallback;
}

export async function apiRequest<T>(token: string | null, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, detailOf(body, `Request failed (${res.status})`));
  return body as T;
}

/** A fetcher that signs requests with the Clerk session, creating the TimeIQ
 * account on first use (as the website does). */
export function useApi() {
  const { getToken, userId } = useAuth();
  return useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const token = await getToken();
      if (token && userId && synced !== userId) {
        await apiRequest(token, "/api/me/sync", { method: "POST" }).catch(() => undefined);
        synced = userId;
      }
      return apiRequest<T>(token, path, init);
    },
    [getToken, userId]
  );
}

export interface Me {
  id: string;
  username: string;
  email: string;
  name: string | null;
  timezone: string;
  image_url: string | null;
  invoicing_enabled?: boolean;
  weekly_hours_target?: number;
  weekly_summary_enabled?: boolean;
  booking_scene?: string | null;
}

export interface Booking {
  id: string;
  event_type_id: string;
  visitor_name: string;
  visitor_email: string;
  visitor_notes: string | null;
  visitor_phone?: string | null;
  visitor_company?: string | null;
  guest_emails?: string[];
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: string;
  price_cents: number | null;
  currency: string;
  rescheduled_from_id?: string | null;
}

export interface CachedEvent {
  id: string;
  calendar_source_id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  source_name: string | null;
}

export interface EventType {
  id: string;
  name: string;
  slug: string;
  duration: number;
  location: string | null;
  is_active: boolean;
  description?: string | null;
  price_cents?: number | null;
  currency?: string;
  color?: string;
  buffer_time?: number;
  max_bookings_per_day?: number | null;
  min_notice_minutes?: number;
  max_days_ahead?: number | null;
  reminder_minutes?: number[];
  remind_host?: boolean;
  collect_phone?: boolean;
  require_phone?: boolean;
  collect_company?: boolean;
  require_company?: boolean;
  collect_url?: boolean;
  require_url?: boolean;
}

export interface CalendarSource {
  id: string;
  type: string;
  name: string;
  ics_url: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  sync_status: string;
  last_sync_error: string | null;
}

export interface AvailabilityRule {
  day_of_week: number; // 0 = Monday
  start_time: string; // "09:00:00"
  end_time: string;
  is_active: boolean;
}

export interface BillingStatus {
  enabled: boolean;
  entitled: boolean;
  subscribed: boolean;
  free_meetings: number;
  free_meetings_left: number | null;
  status?: string;
  plan?: string | null;
  current_period_end?: string | null;
  has_customer?: boolean;
}
