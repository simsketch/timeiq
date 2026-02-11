const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

let userSynced = false;

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Request failed" }));

    // Auto-sync user on first "User not found" error, then retry the original request
    if (
      res.status === 404 &&
      error.detail?.includes("User not found") &&
      !userSynced
    ) {
      userSynced = true;
      const syncUrl = `${API_BASE}/api/me/sync`;
      const syncRes = await fetch(syncUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });
      if (syncRes.ok) {
        // Retry the original request
        return apiFetch<T>(path, options);
      }
    }

    throw new Error(error.detail || "Request failed");
  }
  return res.json();
}
