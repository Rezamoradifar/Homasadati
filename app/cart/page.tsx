import Cart from "../../src/commerce/Cart";
import { CommerceShell } from "../../src/commerce/Shell";
export const metadata = {
  title: "سبد خرید | خانواده هما",
  robots: { index: false, follow: true },
};
export default function CartPage() {
  return (
    <CommerceShell>
      <main id="commerce-main">
        <Cart />
      </main>
    </CommerceShell>
  );
}
