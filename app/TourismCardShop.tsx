import ResponsiveImage from "../src/components/media/ResponsiveImage";
import { sevenLevelCards } from "../src/platform/card-levels";
import AddToCart from "../src/commerce/AddToCart";
import { Money } from "../src/commerce/currency";
import Localized from "../src/i18n/Localized";
import { all } from "../src/platform/schema";
import { travelCardSku } from "../src/platform/travel-card-catalog";
import { travelCardArtwork } from "../src/platform/travel-card-art";
import "./tourism-card-shop.css";

/** All prices and purchase identifiers come from the actual live products.
 * Images decorate the catalog's real card SKUs, not fake booking offers. */
export default function TourismCardShop() {
  const rows = all(
    "SELECT p.id,p.title,p.price,p.images,d.sku FROM p_products p JOIN p_product_details d ON d.product_id=p.id WHERE p.vertical='tourism' AND p.subtype='travel_card' AND p.published=1 AND d.sku LIKE 'HN-TR-CARD-%' ORDER BY d.sku"
  );
  const bySku = new Map(rows.map((r) => [String(r.sku), r]));
  return <Localized><section id="travel-card-shop" className="tourism-card-showcase" aria-labelledby="travel-card-shop-title" dir="rtl">
    <div className="tourism-card-showcase-head">
      <span className="tourism-card-eyebrow"><span className="tourism-card-eyebrow-line" aria-hidden="true" />HOMANET · TRAVEL COLLECTION</span>
      <h2 id="travel-card-shop-title">کارت‌های گردشگری هما نت</h2>
      <p>کارت دلخواه خود را انتخاب کنید؛ پس از پرداخت، کارت به نام شما صادر و ارسال می‌شود. مقصد و تاریخ سفر را بعداً با مجموعه هماهنگ کنید.</p>
      <div className="tourism-card-promise" aria-label="مراحل خرید کارت">
        <span>۱. انتخاب کارت</span>
        <span className="tourism-card-promise-line" aria-hidden="true"/>
        <span>۲. پرداخت و صدور</span>
        <span className="tourism-card-promise-line" aria-hidden="true"/>
        <span>۳. انتخاب سفر در آینده</span>
      </div>
    </div>
    <div className="tourism-cards-gallery">
      {sevenLevelCards.map((tier) => {
        const product = bySku.get(travelCardSku(tier.level));
        if (!product) return null;
        const image = travelCardArtwork[tier.level];
        return <article className={"tourism-card-tile tourism-card-tone-" + tier.tone}
                        id={"travel-card-" + tier.level} key={tier.level}>
          <div className="tourism-card-scene">
            <ResponsiveImage className="tourism-card-photo" src={image} alt=""
              sizes="(max-width:600px) 100vw, (max-width:900px) 50vw, (max-width:1200px) 33vw, 25vw"
              quality={68} loading="lazy"/>
            <span className="tourism-card-edition" dir="ltr">HOMANET · 0{tier.level}/07</span>
            <div className="tourism-card-face">
              <div className="tourism-card-face-head"><span className="tourism-card-brand" dir="ltr">HOMANET <b>TRAVEL</b></span><span className="tourism-card-mark" aria-hidden="true">✦</span></div>
              <div className="tourism-card-face-name">
                <span>کارت گردشگری</span>
                <h3>{tier.name}</h3>
              </div>
              <div className="tourism-card-face-bottom"><span>سفر، انتخاب شما</span><span className="tourism-card-chip" aria-hidden="true"><i/><i/></span></div>
            </div>
          </div>
          <div className="tourism-card-purchase">
            <div className="tourism-card-price"><span>قیمت کارت</span><strong><Money toman={Number(product.price)} /></strong></div>
            <p className="tourism-card-delivery">صدور پس از پرداخت · انتخاب مقصد بعداً</p>
            <AddToCart id={String(product.id)} stock={0} onDemand />
            <a className="tourism-card-details" href={"/shop/" + product.id}>مشاهده مشخصات کارت <span aria-hidden="true">←</span></a>
          </div>
        </article>;
      })}
    </div>
    {rows.length === 0 && <p className="tourism-card-empty">هنوز کارت گردشگری برای فروش فعال نشده است. لطفاً با پشتیبانی تماس بگیرید.</p>}
    <div className="tourism-card-showcase-foot">
      <p>خرید کارت به‌معنی رزرو تور نیست؛ انتخاب سفر و خدمات آن پس از خرید انجام می‌شود.</p>
      <a href="/cart" className="tourism-card-cart-link">مشاهده سبد خرید و تسویه حساب <span aria-hidden="true">←</span></a>
    </div>
  </section></Localized>;
}
