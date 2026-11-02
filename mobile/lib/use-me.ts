import { useEffect, useState } from "react";
import { type Me, useApi } from "./api";

let cached: Me | null = null;

/** The TimeIQ profile (time zone, username), fetched once per session. */
export function useMe(): Me | null {
  const api = useApi();
  const [me, setMe] = useState<Me | null>(cached);
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

export function forgetMe() {
  cached = null;
}
