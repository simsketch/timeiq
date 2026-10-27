import { ClockLoader } from "@/components/ui/clock-loader";
import styles from "@/components/booking/booking-profile.module.css";

export default function BookingLoading() {
  return (
    <div className={styles.loading}>
      <ClockLoader size="lg" label="Loading profile" />
    </div>
  );
}
