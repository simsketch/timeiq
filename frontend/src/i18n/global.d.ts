import type messages from "../../messages/en.json";
import type { Locale } from "./locales";

// Typed keys: tsc fails on a t("...") key that en.json lacks.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
