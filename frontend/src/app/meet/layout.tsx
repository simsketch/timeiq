import { LocalizedClerkProvider } from "@/i18n/clerk-provider";

// Sign-in loads only on pages that use it; public pages skip its ~300 KB.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <LocalizedClerkProvider>{children}</LocalizedClerkProvider>;
}
