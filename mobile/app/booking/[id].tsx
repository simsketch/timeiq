import { useLocalSearchParams } from "expo-router";
import { BookingDetail } from "@/components/booking-detail";

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BookingDetail id={id} />;
}
