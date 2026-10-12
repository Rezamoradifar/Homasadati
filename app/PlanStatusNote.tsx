"use client";
import Localized from "../src/i18n/Localized";
import { useData } from "../src/platform/Widgets";

/** The line under the club cards follows the plan's real state: it says
 * "active" only once staff have switched the card plan live. */
export default function PlanStatusNote({ fa }: { fa: boolean }) {
  const { data, loading, error, retry } = useData("card-plan");
  const status = !loading && !error ? data?.status : undefined;
  return (
    <Localized>
      <p className="club-preview-note">
        {fa
          ? "مبالغ روی کارت، حداقل خرید به ریال است. "
          : "Card amounts are minimum purchases in Iranian rials. "}
        {status === "live"
          ? fa
            ? "طرح هفت کارت فعال است؛ محاسبه و آزادسازی پاداش تابع شرایط و زمان‌بندی طرح است."
            : "The seven-card plan is active; reward calculation and release follow the plan terms and schedule."
          : status === "draft"
            ? fa
              ? "تسویه طرح هنوز فعال نشده است؛ زمان شروع پس از تأیید مدیریت اعلام می‌شود."
              : "Plan settlement is not active yet; the start date will be announced after approval."
            : loading
              ? fa
                ? "در حال دریافت وضعیت طرح…"
                : "Loading plan status…"
              : fa
                ? "وضعیت طرح دریافت نشد."
                : "Plan status could not be loaded."}
        {!loading && status !== "live" && status !== "draft" && (
          <>
            {" "}
            <button type="button" onClick={retry}>
              {fa ? "تلاش دوباره" : "Try again"}
            </button>
          </>
        )}
      </p>
    </Localized>
  );
}
