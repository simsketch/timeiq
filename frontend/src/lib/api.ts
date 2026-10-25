const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

let userSynced = false;

// Pages a lapsed subscriber can still use (billing, export, account deletion).
// A 402 there surfaces as an error message and leaves them on the page.
export const UNGATED_PATHS = ["/settings"];

const LOCATION_PREFIXES = ["body", "query", "path", "header", "cookie"];

function fieldName(loc: unknown): string {
  if (!Array.isArray(loc)) return "";
  // FastAPI prefixes the field with where it came from ("body", "query", ...).
  const parts = loc.filter((p, i) => !(i === 0 && LOCATION_PREFIXES.includes(String(p))));
  return parts
    .map((p) => String(p).replace(/_/g, " "))
    .join(" ")
    .trim();
}

/** Turn a FastAPI error `detail` (a string, an object or a list of them) into one readable message. */
export function errorMessage(detail: unknown, fallback = "Request failed"): string {
  if (detail == null || detail === "") return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((d) => errorMessage(d, "")).filter(Boolean);
    return messages.length ? Array.from(new Set(messages)).join("; ") : fallback;
  }
  if (typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    const msg =
      typeof d.msg === "string" ? d.msg : typeof d.message === "string" ? d.message : null;
    if (msg) {
      const field = fieldName(d.loc);
      const clean = msg.replace(/^Value error, /, "");
      return field ? `${field[0].toUpperCase()}${field.slice(1)}: ${clean}` : clean;
    }
    if ("detail" in d) return errorMessage(d.detail, fallback);
    return fallback;
  }
  return String(detail);
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  // Sync user from Clerk once per session on first authenticated request
  const authHeader = (options?.headers as Record<string, string>)?.Authorization;
  if (!userSynced && authHeader && !path.includes("/api/me/sync")) {
    userSynced = true;
    const syncUrl = `${API_BASE}/api/me/sync`;
    fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
    }).catch(() => {}); // fire-and-forget
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Request failed" }));

    // Subscription lapsed or missing: send them to pricing.
    if (res.status === 402) {
      const onUngatedPage =
        typeof window !== "undefined" &&
        UNGATED_PATHS.some((p) => window.location.pathname.startsWith(p));
      if (typeof window !== "undefined" && !onUngatedPage) {
        window.location.href = "/pricing?reason=subscription";
      }
      throw new Error("This needs an active subscription.");
    }

    // Retry once on "User not found" in case sync hasn't completed yet
    if (
      res.status === 404 &&
      typeof error.detail === "string" &&
      error.detail.includes("User not found")
    ) {
      const syncUrl = `${API_BASE}/api/me/sync`;
      const syncRes = await fetch(syncUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });
      if (syncRes.ok) {
        return apiFetch<T>(path, options);
      }
    }

    throw new Error(errorMessage(error?.detail));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}
