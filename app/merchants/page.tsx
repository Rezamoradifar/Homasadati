import { CommerceShell } from "../../src/commerce/Shell";
import { MerchantDirectory } from "../../src/platform/ClubPanels";
import Localized from "../../src/i18n/Localized";
import "../../src/platform/panel.css";
export const metadata = { title: "پذیرندگان | همای سعادت" };
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
