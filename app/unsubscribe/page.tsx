import Localized from "../../src/i18n/Localized";
import { CommerceShell } from "../../src/commerce/Shell";
import UnsubscribeForm from "../../src/commerce/UnsubscribeForm";

export default function Unsubscribe() {
  return (
    <Localized>
      <CommerceShell>
        <main id="commerce-main" className="shop-wrap portal unsubscribe-page">
          <nav className="unsubscribe-back-nav" aria-label="دسترسی سریع">
            <a href="/">هما نت · Home</a>
          </nav>
          <UnsubscribeForm />
        </main>
      </CommerceShell>
    </Localized>
  );
}
