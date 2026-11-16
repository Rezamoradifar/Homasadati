import PrivilegeCard from "./PrivilegeCard";
import { sevenLevelCards } from "../src/platform/card-levels";
import AddToCart from "../src/commerce/AddToCart";
import { Money } from "../src/commerce/currency";
import Localized from "../src/i18n/Localized";
import { all } from "../src/platform/schema";
import { travelCardSku } from "../src/platform/travel-card-catalog";

export default function TourismCardShop() {
  const rows = all(
    "SELECT p.id,p.title,p.price,d.sku FROM p_products p JOIN p_product_details d ON d.product_id=p.id WHERE p.vertical='tourism' AND p.subtype='travel_card' AND p.published=1 AND d.sku LIKE 'HN-TR-CARD-%' ORDER BY d.sku"
  );
  const bySku = new Map(rows.map((r) => [String(r.sku), r]));
  return <Localized><section id="travel-card-shop" className="brand-chapter" aria-labelledby="travel-card-shop-title">
    <h2 id="travel-card-shop-title">خرید کارت گردشگری هما نت</h2>
    <p>خودِ کارت یک محصول قابل خرید است. قیمت هر کارت در همین بخش مشخص است؛ پس از پرداخت و ثبت نشانی ارسال، کارت اختصاصی صادر و برای خریدار ارسال می‌شود. مقصد و تاریخ سفر بعداً تعیین می‌شود و خرید کارت به معنی رزرو تور نیست.</p>
    <div className="shop-grid">
      {sevenLevelCards.map((tier) => {
        const product = bySku.get(travelCardSku(tier.level));
        if (!product) return null;
        return <article className="shop-card" id={"travel-card-" + tier.level} key={tier.level}>
          <PrivilegeCard name={tier.name} tone={tier.tone} level={tier.level} showPurchaseMinimum={false} />
          <h3>{product.title}</h3>
          <p>مبلغ کارت</p>
          <strong><Money toman={Number(product.price)} /></strong>
          <p>صدور کارت پس از تأیید پرداخت؛ انتخاب سفر بعداً</p>
          <AddToCart id={String(product.id)} stock={0} onDemand />
          <a href={"/shop/" + product.id}>مشخصات و شرایط کارت</a>
        </article>;
      })}
    </div>
    {rows.length === 0 && <p className="shop-notice">برای فروش کارت‌ها، ثبت محصولات در کاتالوگ لازم است. پس از فعال‌سازی کاتالوگ، قیمت و خرید کارت در همین بخش نمایش داده می‌شود.</p>}
    <p><a href="/cart" className="commerce-button gold">مشاهده سبد خرید و تسویه کارت</a></p>
  </section></Localized>;
}
