import { ClerkProvider } from "@clerk/nextjs";
import { preload } from "react-dom";
import { CLERK_UI_CHUNKS } from "@/lib/clerk-js";

// Sign-in loads only on pages that use it; public pages skip its ~300 KB.
export default function Layout({ children }: { children: React.ReactNode }) {
  // Fetch the form's code alongside clerk-js instead of after it has run.
  for (const url of CLERK_UI_CHUNKS) preload(url, { as: "script" });
  return <ClerkProvider>{children}</ClerkProvider>;
}
