import { useSyncExternalStore } from "react";

// Text shared into the app, handed from the share handler to the Import tab.
let text = "";
const listeners = new Set<() => void>();

export function setSharedText(value: string) {
  text = value;
  listeners.forEach((l) => l());
}

export function useSharedText(): [string, () => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => text
  );
  return [value, () => setSharedText("")];
}
