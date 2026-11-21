import { LocalizedClerkProvider } from "@/i18n/clerk-provider";
import { ClientMessages } from "@/i18n/client-messages";
import { preload } from "react-dom";
import { CLERK_UI_CHUNKS } from "@/lib/clerk-js";

// Sign-in loads only on pages that use it; public pages skip its ~300 KB.
export default function Layout({ children }: { children: React.ReactNode }) {
  // Fetch the form's code alongside clerk-js instead of after it has run.
  for (const url of CLERK_UI_CHUNKS) preload(url, { as: "script" });
  return <LocalizedClerkProvider><ClientMessages namespaces={["shell", "auth"]}>{children}</ClientMessages></LocalizedClerkProvider>;
}
