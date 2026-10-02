import { translatedMetadata } from "../../../src/i18n/server";
import Localized from "../../../src/i18n/Localized";
import { CommerceShell } from "../../../src/commerce/Shell";
import PaymentResult from "../../../src/commerce/PaymentResult";

export async function generateMetadata() {
  return translatedMetadata({ title: "نتیجهٔ پرداخت | هما نت", robots: { index: false, follow: false } });
}
export default function PaymentResultPage() {
  return (
    <Localized>
      <CommerceShell>
        <main id="commerce-main">
          <PaymentResult />
        </main>
      </CommerceShell>
    </Localized>
  );
}
