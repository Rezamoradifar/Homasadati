"use client";
import Localized from "../i18n/Localized";
import PlanText from "../commerce/PlanText";
import { DataState, useData } from "./Widgets";
export default function SevenCardPublic() {
  const state = useData("card-plan");
  return (
    <DataState state={state}>
      {() => (
        <Localized>
          <>
            <p role="status">
              این پلن در مرحله آماده‌سازی است؛ پرداخت، فعال‌سازی جایگاه و صدور
              ووچر بر اساس آن هنوز فعال نشده است.
            </p>
            <PlanText />
          </>
        </Localized>
      )}
    </DataState>
  );
}
