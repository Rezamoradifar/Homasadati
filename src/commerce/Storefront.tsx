"use client";

import {useSiteLocale} from "../i18n/SiteLocale";
import {catalogCopy} from "../i18n/catalog";
import Localized from "../i18n/Localized";
import ResponsiveImage from "../components/media/ResponsiveImage";

import { useState } from "react";
import { DataState, useData } from "../platform/Widgets";
import { amount, RecordData } from "../platform/client";
import { brands, sectorKeys, isSector } from "./brands";
import AddToCart from "./AddToCart";
export default function Storefront({
  initialVertical = "",
}: {
  initialVertical?: string;
}) {
  const {locale}=useSiteLocale();
  const [vertical, setVertical] = useState(initialVertical),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0);
  const state = useData(
    `catalog?vertical=${encodeURIComponent(vertical)}&q=${encodeURIComponent(q)}&page=${page}`,
    reload,
  );
  return (
    <Localized><div className="shop-wrap">
      <div className="shop-heading">
        <span className="commerce-eyebrow">انتخاب از خانواده هما</span>
        <h1>
          {isSector(vertical)
            ? `فروشگاه ${brands[vertical].name}`
            : "فروشگاه هما"}
        </h1>
        <p>
          کالا، تجربه و اشتراک با مشخصات روشن؛ قیمت و موجودی از کاتالوگ واقعی
          مجموعه.
        </p>
      </div>
      <form
        className="shop-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(search);
          setPage(1);
        }}
      >
        <input
          aria-label="جست‌وجوی محصول"
          placeholder="نام محصول یا SKU…"
          maxLength={200}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="انتخاب حوزه"
          value={vertical}
          onChange={(e) => {
            setVertical(e.target.value);
            setPage(1);
          }}
        >
          <option value="">همه حوزه‌ها</option>
          {sectorKeys.map((k) => (
            <Localized key={k}><option value={k}>
              {brands[k].name} · {brands[k].label}
            </option></Localized>
          ))}
        </select>
        <button className="commerce-button">جست‌وجو</button>
        <button
          type="button"
          className="commerce-button outline"
          onClick={() => setReload((x) => x + 1)}
        >
          تازه‌سازی
        </button>
        <a className="commerce-button gold" href="/cart">
          سبد خرید
        </a>
      </form>
      <DataState state={state}>
        {(d) => (
          <Localized><>
            {d.rows.length ? (
              <div className="shop-grid">
                {d.rows.map((p: RecordData) => {
                  const images = JSON.parse(p.images), copy=catalogCopy({title:p.title,description:p.description,details:p.details},locale);
                  return (
                    <Localized key={p.id}><article className="shop-card">
                      <a href={`/shop/${p.id}`}>
                        {images[0] ? (
                          <ResponsiveImage src={images[0]} sizes="(max-width: 700px) 90vw, (max-width: 1050px) 44vw, 400px" alt={copy.title} loading="lazy" />
                        ) : (
                          <div className="no-image">
                            تصویر محصول هنوز ثبت نشده
                          </div>
                        )}
                      </a>
                      <small>
                        {isSector(p.vertical)
                          ? brands[p.vertical].name
                          : p.vertical}
                      </small>
                      <h2>
                        <a href={`/shop/${p.id}`}>{copy.title}</a>
                      </h2>
                      <p>
                        {copy.description.slice(0, 180)}
                        {copy.description.length > 180 ? "…" : ""}
                      </p>
                      <strong>{amount(p.price)} تومان</strong>
                      <a href={`/shop/${p.id}`}>مشخصات کامل و شرایط خرید ←</a>
                      <AddToCart id={p.id} stock={p.stock} />
                    </article></Localized>
                  );
                })}
              </div>
            ) : (
              <p className="shop-empty">
                هنوز محصول منتشرشده‌ای برای این انتخاب موجود نیست. پس از ثبت و
                انتشار محصول توسط مدیر، اینجا نمایش داده می‌شود.
              </p>
            )}
            <div className="commerce-pager">
              <button
                className="commerce-button"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                قبلی
              </button>
              <span>صفحه {amount(page)}</span>
              <button
                className="commerce-button"
                disabled={!d.hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                بعدی
              </button>
            </div>
          </></Localized>
        )}
      </DataState>
    </div></Localized>
  );
}
