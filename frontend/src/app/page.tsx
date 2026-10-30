import { LandingPage } from "@/components/landing/landing-page";
import { HEADLINES } from "@/components/landing/headlines";

export default function HomePage() {
  return <LandingPage headline={HEADLINES.default} />;
}
