import BookingProfilePage from "../[username]/page";

export default function YoyoCodeBookingPage() {
  return <BookingProfilePage params={Promise.resolve({ username: "yoyocode" })} />;
}
