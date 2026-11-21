import { ClientMessages } from "@/i18n/client-messages";

// Only this area's copy reaches the browser.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <ClientMessages namespaces={["misc"]}>{children}</ClientMessages>;
}
