import BookingFlow from "@/components/booking/booking-flow";
import { EmbedFrame } from "@/components/booking/embed-frame";

export default async function BookingFlowPage({ searchParams }: {
  searchParams: Promise<{ embed?: string }>;
}) {
  const { embed } = await searchParams;
  const embedded = embed === "1";
  const content = <BookingFlow embed={embedded} />;
  return embedded ? <EmbedFrame enabled>{content}</EmbedFrame> : content;
}
