import { useEffect, useState } from "react";
import { type Me, useApi } from "./api";

let cached: Me | null = null;
const listeners = new Set<(me: Me) => void>();

/** The TimeIQ profile (time zone, username), fetched once per session. */
export function useMe(): Me | null {
  const api = useApi();
  const [me, setMe] = useState<Me | null>(cached);
  useEffect(() => {
    listeners.add(setMe);
    return () => {
      listeners.delete(setMe);
    };
  }, []);
  useEffect(() => {
    if (cached) return;
    api<Me>("/api/me")
      .then((m) => {
        cached = m;
        setMe(m);
      })
      .catch(() => undefined);
  }, [api]);
  return me;
}

/** Replace the cached profile after an edit, so every screen sees it. */
export function rememberMe(me: Me) {
  cached = me;
  listeners.forEach((l) => l(me));
}

export function forgetMe() {
  cached = null;
}
