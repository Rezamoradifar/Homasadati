import Localized from "../../src/i18n/Localized";
import { CommerceShell } from "../../src/commerce/Shell";
import RegistrationEntry from "../../src/platform/RegistrationEntry";

export default function Page() {
  return (
    <Localized>
      <CommerceShell>
        <main id="commerce-main" className="portal portal-registration-page" dir="rtl" lang="fa">
          <nav className="registration-back-nav" aria-label="دسترسی سریع">
            <a href="/">← هما نت</a>
          </nav>
          <RegistrationEntry />
        </main>
      </CommerceShell>
    </Localized>
  );
}
