
import Localized from "../../src/i18n/Localized";
import { CommerceShell } from "../../src/commerce/Shell";
import Storefront from "../../src/commerce/Storefront";
import { isSector } from "../../src/commerce/brands";
export const metadata = {
  title: "فروشگاه خانواده هما | همای سعادت",
  description:
    "محصولات ایرانی، چرم، صنایع‌دستی، مراقبت، تور و اشتراک با مشخصات کامل و سبد خرید.",
};
export default async function Shop({
  searchParams: pendingSearch,
}: {
  searchParams: Promise<{ vertical?: string }>;
}) {
  const searchParams = await pendingSearch;
  const v = searchParams.vertical || "";
  return (
    <Localized><CommerceShell>
      <main id="commerce-main">
        <Storefront initialVertical={isSector(v) ? v : ""} />
      </main>
    </CommerceShell></Localized>
  );
}
