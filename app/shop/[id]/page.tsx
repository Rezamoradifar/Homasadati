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
export function generateMetadata({
  params,
}: {
  params: { id: string };
}): Metadata {
  const p = get(params.id);
  if (!p) return {};
  const d = publicCatalogDetails(p.details);
  return {
    title: d.seoTitle || p.title,
    description: d.seoDescription || p.description.slice(0, 170),
  };
}
export default function ProductPage({ params }: { params: { id: string } }) {
  const p = get(params.id);
  if (!p) notFound();
  const d = publicCatalogDetails(p.details),
    images = JSON.parse(p.images),
    brand = isSector(p.vertical) ? brands[p.vertical] : null;
  return (
    <CommerceShell>
      <main id="commerce-main" className="shop-wrap">
        <p>
          <a href="/shop">فروشگاه</a> / {brand?.name} / {p.title}
        </p>
        <div className="shop-product">
          <div className="shop-product-images">
            {images.length ? (
              images.map((src: string, i: number) => (
                <img
                  key={src}
                  src={src}
                  alt={`${p.title} — تصویر ${i + 1}`}
                  loading={i ? "lazy" : "eager"}
                />
              ))
            ) : (
              <p className="shop-empty">تصویر محصول هنوز ثبت نشده است.</p>
            )}
          </div>
          <div>
            <span className="commerce-eyebrow">
              {brand?.latin} / {d.sku || p.subtype}
            </span>
            <h1>{p.title}</h1>
            <p>{p.description}</p>
            <h2>{Number(p.price).toLocaleString("fa-IR")} تومان</h2>
            {d.comparePrice > p.price && (
              <del>{Number(d.comparePrice).toLocaleString("fa-IR")} تومان</del>
            )}
            <p>
              موجودی / ظرفیت: {p.stock.toLocaleString("fa-IR")} · مهلت لغو پس از
              پرداخت: {p.cancel_hours.toLocaleString("fa-IR")} ساعت
            </p>
            <AddToCart id={p.id} stock={p.stock} />
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
                f.type !== "section" &&
                (!f.sectors || f.sectors.includes(p.vertical)),
            )
            .map((f) => {
              const value = d[f.name.replace("detail_", "")];
              return value ? (
                <div key={f.name}>
                  <dt>{f.label}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ) : null;
            })}
        </dl>
        <p>
          برای پرسش درباره سفارش یا پیگیری پرداخت، از بخش سفارش‌های حساب خود
          استفاده کنید.
        </p>
      </main>
    </CommerceShell>
  );
}
