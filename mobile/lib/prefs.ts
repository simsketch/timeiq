import * as SecureStore from "expo-secure-store";

/** Small per-device choices (not secrets), kept across launches. Reads and
 * writes never throw: a missing value just means the default. */
export async function getPref(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(`pref.${key}`);
  } catch {
    return null;
  }
}

export function setPref(key: string, value: string): void {
  SecureStore.setItemAsync(`pref.${key}`, value).catch(() => undefined);
}
