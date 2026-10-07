"use client";
import Localized from "../i18n/Localized";
import PlanText from "../commerce/PlanText";
import { SEVEN_LEVEL_VERSION } from "./card-levels";
import { DataState, useData } from "./Widgets";
export default function SevenCardPublic() {
  const state = useData("card-plan");
  return (
    <DataState state={state}>
      {(data) => (
        <Localized>
          <>
            <p role="status">
              {data.version !== SEVEN_LEVEL_VERSION
                ? "این جدول مشخصات طرح هفت کارت است؛ اجرای این نسخه هنوز فعال نشده است."
                : data.status === "live"
                  ? "طرح هفت کارت فعال است؛ حجم هر جایگاه از زمان فعال‌شدن همان جایگاه محاسبه می‌شود."
                  : "طرح هفت کارت آماده است؛ تسویهٔ پاداش‌ها پس از فعال‌سازی رسمی آغاز می‌شود."}
            </p>
            <PlanText />
          </>
        </Localized>
      )}
    </DataState>
  );
}
