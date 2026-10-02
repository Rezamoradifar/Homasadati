"use client";
import Localized from "../src/i18n/Localized";
import { useData } from "../src/platform/Widgets";

/** The line under the club cards follows the plan's real state: it says
 * "active" only once staff have switched the card plan live. */
export default function PlanStatusNote({ fa }: { fa: boolean }) {
  const { data } = useData("card-plan");
  const live = data?.status === "live";
  return (
    <Localized>
      <p className="club-preview-note">
        {fa
          ? live
            ? "مبالغ روی کارت، حداقل خرید به ریال است. طرح هشت کارت فعال است و پاداش‌ها هر هفته محاسبه و واریز می‌شوند."
            : "مبالغ روی کارت، حداقل خرید به ریال است. طرح هشت کارت به‌زودی فعال می‌شود؛ زمان شروع از همین‌جا اعلام خواهد شد."
          : live
            ? "Card amounts are minimum purchases in Iranian rials. The eight-card plan is active and rewards are calculated and paid weekly."
            : "Card amounts are minimum purchases in Iranian rials. The eight-card plan is launching soon; the start date will be announced here."}
      </p>
    </Localized>
  );
}
