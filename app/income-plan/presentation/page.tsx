import { translatedMetadata } from "../../../src/i18n/server";
import Localized from "../../../src/i18n/Localized";
import PlanPresentation from "../../../src/commerce/PlanPresentation";
import { CommerceShell } from "../../../src/commerce/Shell";
export async function generateMetadata() {
  return translatedMetadata({
    title: "ارائهٔ طرح هفت کارت | هما نت",
    description: "معرفی اسلایدی طرح هفت کارت باشگاه هما نت: کارت‌ها، پاداش تعادل، میزهای کار، ووچر و برداشت.",
  });
}
export default function Page() {
  return (
    <Localized>
      <CommerceShell>
        <main id="commerce-main" className="plan-page plan-presentation-page">
          <PlanPresentation />
        </main>
      </CommerceShell>
    </Localized>
  );
}
