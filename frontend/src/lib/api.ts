const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

let userSynced = false;

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

    // Retry once on "User not found" in case sync hasn't completed yet
    if (
      res.status === 404 &&
      error.detail?.includes("User not found")
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

    throw new Error(error.detail || "Request failed");
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}
