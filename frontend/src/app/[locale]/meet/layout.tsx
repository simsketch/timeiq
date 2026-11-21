import { LocalizedClerkProvider } from "@/i18n/clerk-provider";
import { ClientMessages } from "@/i18n/client-messages";

// Sign-in loads only on pages that use it; public pages skip its ~300 KB.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <LocalizedClerkProvider><ClientMessages namespaces={["shell", "meet"]}>{children}</ClientMessages></LocalizedClerkProvider>;
}
