import { useTranslations } from "next-intl";
import { ClockLoader } from "@/components/ui/clock-loader";
import styles from "@/components/booking/booking-profile.module.css";

export default function BookingLoading() {
  const t = useTranslations("booking");
  return (
    <div className={styles.loading}>
      <ClockLoader size="lg" label={t("loadingProfile")} />
    </div>
  );
}
