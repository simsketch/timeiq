import { ClerkProvider } from "@clerk/nextjs";

// Sign-in loads only on pages that use it; public pages skip its ~300 KB.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
