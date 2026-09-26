import { translatedMetadata } from "../../src/i18n/server";

import Localized from "../../src/i18n/Localized";
import { CommerceShell } from "../../src/commerce/Shell";
import Storefront from "../../src/commerce/Storefront";
import { isSector } from "../../src/commerce/brands";
import { validCraftPath } from "../../src/commerce/craft-taxonomy";
export async function generateMetadata() { return translatedMetadata({
  title: "فروشگاه خانواده همای | هما نت",
  description:
    "محصولات ایرانی، چرم، صنایع‌دستی، مراقبت، تور و اشتراک با مشخصات کامل و سبد خرید.",
}); }
export default async function Shop({
  searchParams: pendingSearch,
}: {
  searchParams: Promise<{ vertical?: string; cat?: string; tech?: string; item?: string; q?: string }>;
}) {
  const searchParams = await pendingSearch;
  // Leather is presented inside handicrafts; old leather links land there.
  const leather = searchParams.vertical === "leather";
  const v = leather ? "craft" : searchParams.vertical || "";
  if (leather && !searchParams.cat) searchParams.cat = "leather";
  const craft = validCraftPath(searchParams.cat || "", searchParams.tech || "", searchParams.item || "")
    ? { cat: searchParams.cat || "", tech: searchParams.tech || "", item: searchParams.item || "" }
    : { cat: "", tech: "", item: "" };
  return (
    <Localized><CommerceShell>
      <main id="commerce-main">
        <Storefront initialVertical={isSector(v) ? v : ""} initialQuery={(searchParams.q || "").slice(0, 200)} {...craft} />
      </main>
    </CommerceShell></Localized>
  );
}
