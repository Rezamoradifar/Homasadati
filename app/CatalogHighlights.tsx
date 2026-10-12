"use client";

import Localized from "../src/i18n/Localized";
import { useSiteLocale } from "../src/i18n/SiteLocale";
import { catalogCopy } from "../src/i18n/catalog";
import { useData } from "../src/platform/Widgets";
import type { RecordData } from "../src/platform/client";
import ResponsiveImage from "../src/components/media/ResponsiveImage";
import { Money } from "../src/commerce/currency";

function productImage(value: unknown): string | undefined {
  try {
    const images = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(images)
      ? images.find((src): src is string => typeof src === "string" && /^(\/(?!\/)|https:\/\/)/.test(src))
      : undefined;
  } catch {
    return undefined;
  }
}

/** Use the published catalogue as the source of product names, photos and prices.
 * No concept images or fictional stock are substituted when it is unavailable. */
export default function CatalogHighlights() {
  const { locale } = useSiteLocale();
  const { data, loading, error, retry } = useData("catalog?vertical=leather&page=1");
  const products: RecordData[] = !loading && !error && Array.isArray(data?.rows)
    ? data.rows.slice(0, 6)
    : [];

  return (
    <Localized>
      <section className="catalog-highlights" aria-labelledby="catalog-highlights-title" aria-busy={loading}>
        <div className="catalog-highlights-heading">
          <div>
            <p className="commerce-eyebrow">فروشگاه هما نت</p>
            <h2 id="catalog-highlights-title">محصولات چرمی</h2>
            <p>تصاویر، قیمت و مشخصات هر محصول را پیش از خرید ببینید.</p>
          </div>
          <a className="commerce-button outline" href="/shop?vertical=leather">مشاهده همه محصولات چرمی</a>
        </div>
        {loading ? (
          <p className="catalog-highlights-status" role="status">در حال دریافت محصولات…</p>
        ) : error ? (
          <div className="catalog-highlights-status" role="status">
            <p>محصولات دریافت نشد. دوباره تلاش کنید یا به فروشگاه بروید.</p>
            <button type="button" className="commerce-button outline" onClick={retry}>تلاش دوباره</button>
          </div>
        ) : products.length ? (
          <div className="catalog-highlights-grid" tabIndex={0} role="region" aria-label="محصولات چرمی">
            {products.map((product) => {
              const copy = catalogCopy(product as Parameters<typeof catalogCopy>[0], locale);
              const image = productImage(product.images);
              return (
                <a className="catalog-highlight" href={`/shop/${encodeURIComponent(product.id)}`} key={product.id}>
                  <div className="catalog-highlight-image">
                    {image ? <ResponsiveImage src={image} alt="" sizes="(max-width: 767px) 78vw, (max-width: 1100px) 44vw, 400px" loading="lazy" /> : <span>هما نت</span>}
                  </div>
                  <h3>{copy.title}</h3>
                  <strong><Money toman={product.price} /></strong>
                  <span className="catalog-highlight-link">مشخصات و شرایط خرید</span>
                </a>
              );
            })}
          </div>
        ) : (
          <p className="catalog-highlights-status">برای اطلاع از موجودی محصولات چرمی با پشتیبانی تماس بگیرید. <a href="/contact">ارتباط با هما نت</a></p>
        )}
      </section>
    </Localized>
  );
}
