import { translatedMetadata } from "../../src/i18n/server";

import Localized from "../../src/i18n/Localized";
import Cart from "../../src/commerce/Cart";
import { CommerceShell } from "../../src/commerce/Shell";
export async function generateMetadata() { return translatedMetadata({
  title: "سبد خرید | خانواده همای",
  robots: { index: false, follow: true },
}); }
export default function CartPage() {
  return (
    <Localized><CommerceShell>
      <main id="commerce-main">
        <Cart />
      </main>
    </CommerceShell></Localized>
  );
}
