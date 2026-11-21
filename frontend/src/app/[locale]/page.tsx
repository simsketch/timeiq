import { LandingPage } from "@/components/landing/landing-page";
import { ClientMessages } from "@/i18n/client-messages";
import { HEADLINES } from "@/components/landing/headlines";

export default function HomePage() {
  return (
    <ClientMessages namespaces={["shell", "landing", "headlines", "auth", "pricing"]}>
      <LandingPage headline={HEADLINES.default} />
    </ClientMessages>
  );
}
