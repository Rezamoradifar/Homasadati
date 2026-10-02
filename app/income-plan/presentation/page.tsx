import { translatedMetadata } from "../../../src/i18n/server";
import Localized from "../../../src/i18n/Localized";
import PlanPresentation from "../../../src/commerce/PlanPresentation";
export async function generateMetadata() {
  return translatedMetadata({
    title: "ارائهٔ طرح هشت کارت | هما نت",
    description: "معرفی اسلایدی طرح هشت کارت باشگاه هما نت: کارت‌ها، پاداش تعادل، میزهای کار، ووچر و برداشت.",
  });
}
export default function Page() {
  return (
    <Localized>
      <main className="plan-page">
        <PlanPresentation />
      </main>
    </Localized>
  );
}
