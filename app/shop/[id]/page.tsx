import {Money,UsdNote} from '../../../src/commerce/currency';
import ProductGallery from "../../../src/commerce/ProductGallery";
import {siteLocale} from "../../../src/i18n/server";
import {catalogCopy,isPublicSpecification} from "../../../src/i18n/catalog";

import Localized from "../../../src/i18n/Localized";
import ResponsiveImage from "../../../src/components/media/ResponsiveImage";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { one } from "../../../src/platform/schema";
import { publicCatalogDetails } from "../../../src/platform/catalog-model";
import { extendedCatalogFields } from "../../../src/platform/catalog-fields";
import { brands, isSector } from "../../../src/commerce/brands";
import { CommerceShell } from "../../../src/commerce/Shell";
import AddToCart from "../../../src/commerce/AddToCart";
function get(id: string) {
  return one(
    "SELECT p.*,d.details FROM p_products p LEFT JOIN p_product_details d ON d.product_id=p.id WHERE p.id=? AND p.published=1",
    id,
  );
}
export async function generateMetadata({
  params: pendingParams,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const params = await pendingParams;
  const p = get(params.id);
  if (!p) return {};
  const d = publicCatalogDetails(p.details),copy=catalogCopy({...p,details:d} as {title:string;description:string;details:Record<string,unknown>},await siteLocale());
  return {
    title: copy.title,
    description: copy.description.slice(0, 170),
  };
}
export default async function ProductPage({
  params: pendingParams,
}: {
  params: Promise<{ id: string }>;
}) {
  const params = await pendingParams;
  const p = get(params.id);
  if (!p) notFound();
  const d = publicCatalogDetails(p.details),
    images = JSON.parse(p.images),
    brand = isSector(p.vertical) ? brands[p.vertical] : null;
  const copy=catalogCopy({...p,details:d} as {title:string;description:string;details:Record<string,unknown>},await siteLocale());
  return (
    <Localized><CommerceShell>
      <main id="commerce-main" className="shop-wrap">
        <p>
          <a href="/shop">فروشگاه</a> / {brand?.name} / {copy.title}
        </p>
        <div className="shop-product">
          <ProductGallery images={images} title={copy.title}/>
          <div>
            <span className="commerce-eyebrow">
              {brand?.latin} / {d.sku || p.subtype}
            </span>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
            <h2><Money toman={Number(p.price)}/></h2>
            <UsdNote/>
            {d.comparePrice > p.price && (
              <del><Money toman={Number(d.comparePrice)}/></del>
            )}
            <p>
              موجودی / ظرفیت: {p.stock.toLocaleString("fa-IR")} · مهلت لغو پس از
              پرداخت: {p.cancel_hours.toLocaleString("fa-IR")} ساعت
            </p>
            <div className="product-purchase-panel" id="purchase">
              <p className={p.stock>0?"stock-status available":"stock-status"}>{p.stock>0?"موجود و قابل سفارش":"فعلاً ناموجود"}</p>
              <AddToCart id={p.id} stock={p.stock} />
              <dl className="purchase-facts"><dt>ارسال و تحویل</dt><dd>{d.shippingNote||d.delivery||"زمان و روش تحویل را پیش از پرداخت با پشتیبانی هماهنگ کنید."}</dd><dt>ضمانت و مرجوعی</dt><dd>{d.warranty||"شرایط لغو این محصول و قوانین خرید را پیش از پرداخت بخوانید."}</dd></dl>
              <a href="/help">راهنمای خرید و پشتیبانی</a>
            </div>
            <p className="shop-notice">
              مبلغ نهایی هنگام ثبت سفارش از دیتابیس کنترل می‌شود. هزینه جداگانه
              حمل در این نسخه دریافت نمی‌شود؛ شرایط تحویل درج‌شده محصول را
              بخوانید. بازگشت وجه سفارش واجد شرایط به کیف پول حساب انجام می‌شود.
            </p>
            {brand && (
              <a
                className="commerce-button outline"
                href={`/worlds/${p.vertical}`}
              >
                درباره {brand.name}
              </a>
            )}
          </div>
        </div>
        <h2>شناسنامه و مشخصات</h2>
        <dl className="product-specs">
          {extendedCatalogFields
            .filter(
              (f) =>
                f.type !== "section" && isPublicSpecification(f.name) &&
                (!f.sectors || f.sectors.includes(p.vertical)),
            )
            .map((f) => {
              const value = d[f.name.replace("detail_", "")];
              return value ? (
                <Localized key={f.name}><div>
                  <dt>{f.label}</dt>
                  <dd>{String(value)}</dd>
                </div></Localized>
              ) : null;
            })}
        </dl>
        <p>
          برای پرسش درباره سفارش یا پیگیری پرداخت، از بخش سفارش‌های حساب خود
          استفاده کنید.
        </p>
      </main>
    </CommerceShell></Localized>
  );
}
