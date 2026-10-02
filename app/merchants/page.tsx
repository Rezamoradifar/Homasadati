import { translatedMetadata } from "../../src/i18n/server";
import { CommerceShell } from "../../src/commerce/Shell";
import { MerchantDirectory } from "../../src/platform/ClubPanels";
import Localized from "../../src/i18n/Localized";
import "../../src/platform/panel.css";
export async function generateMetadata() { return translatedMetadata({ title: "پذیرندگان | هما نت" }); }
export default function Merchants() {
  return (
    <CommerceShell>
      <Localized>
        <main id="commerce-main" className="portal">
          <div className="portal-main">
            <h1>پذیرندگان باشگاه</h1>
            <MerchantDirectory />
          </div>
        </main>
      </Localized>
    </CommerceShell>
  );
}
