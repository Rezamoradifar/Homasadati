import { CommerceShell } from "../../src/commerce/Shell";
import Storefront from "../../src/commerce/Storefront";
import { isSector } from "../../src/commerce/brands";
export const metadata = {
  title: "فروشگاه خانواده هما | همای سعادت",
  description:
    "محصولات ایرانی، چرم، صنایع‌دستی، مراقبت، تور و اشتراک با مشخصات کامل و سبد خرید.",
};
export default function Shop({
  searchParams,
}: {
  searchParams: { vertical?: string };
}) {
  const v = searchParams.vertical || "";
  return (
    <CommerceShell>
      <main id="commerce-main">
        <Storefront initialVertical={isSector(v) ? v : ""} />
      </main>
    </CommerceShell>
  );
}
