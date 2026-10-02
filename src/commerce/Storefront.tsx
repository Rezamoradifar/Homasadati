"use client";

import { Money } from "./currency";
import {useSiteLocale} from "../i18n/SiteLocale";
import {catalogCopy} from "../i18n/catalog";
import Localized from "../i18n/Localized";
import ResponsiveImage from "../components/media/ResponsiveImage";

import { useState } from "react";
import { DataState, useData } from "../platform/Widgets";
import { amount, RecordData } from "../platform/client";
import { brands, menuLine, menuName, menuSectors, isSector } from "./brands";
import AddToCart from "./AddToCart";
import CraftNav from "./CraftNav";
import { craftCategories, craftCategory, craftShopHref } from "./craft-taxonomy";

/** The material shown on a handicraft card, e.g. "مس · خاتم‌کاری". */
function craftLabel(p: RecordData) {
  const c = p.craft?.category ? craftCategory(p.craft.category) : undefined;
  if (!c) return "";
  const t = c.techniques?.find((x) => x.id === p.craft.technique);
  return t ? `${c.short} · ${t.name}` : c.short;
}
export default function Storefront({
  initialVertical = "",
  initialQuery = "",
  cat = "",
  tech = "",
  item = "",
}: {
  initialVertical?: string;
  initialQuery?: string;
  cat?: string;
  tech?: string;
  item?: string;
}) {
  const {locale}=useSiteLocale();
  const [vertical, setVertical] = useState(initialVertical),
    [q, setQ] = useState(initialQuery),
    [search, setSearch] = useState(initialQuery),
    [page, setPage] = useState(1),
    [reload, setReload] = useState(0);
  const state = useData(
    `catalog?vertical=${encodeURIComponent(vertical)}&q=${encodeURIComponent(q)}&page=${page}` +
      (cat ? `&cat=${cat}&tech=${tech}&item=${item}` : ""),
    reload,
  );
  const card = (p: RecordData) => {
                  const images = JSON.parse(p.images), copy=catalogCopy({title:p.title,description:p.description,details:p.details},locale);
                  return (
                    <Localized key={p.id}><article className="shop-card">
                      <a href={`/shop/${p.id}`}>
                        {images[0] ? (
                          <ResponsiveImage src={images[0]} sizes="(max-width: 700px) 90vw, (max-width: 1050px) 44vw, 400px" alt={copy.title} loading="lazy" />
                        ) : (
                          <div className="no-image">
                            <img src="/assets/brand/homanet-horizontal-orange.png" alt="هما نت" loading="lazy" />
                          </div>
                        )}
                      </a>
                      <small>
                        {craftLabel(p) || (isSector(p.vertical) ? menuName(p.vertical) : p.vertical)}
                      </small>
                      <h2>
                        <a href={`/shop/${p.id}`}>{copy.title}</a>
                      </h2>
                      <p>
                        {copy.description.slice(0, 180)}
                        {copy.description.length > 180 ? "…" : ""}
                      </p>
                      <strong><Money toman={p.price}/></strong>
                      <a href={`/shop/${p.id}`}>مشخصات کامل و شرایط خرید ←</a>
                      <AddToCart id={p.id} stock={p.stock} />
                    </article></Localized>
                  );
  };
  return (
    <Localized><div className="shop-wrap">
      <div className="shop-heading">
        <span className="commerce-eyebrow">انتخاب از خانواده همای</span>
        <h1>
          {isSector(vertical)
            ? `فروشگاه ${brands[vertical].name}`
            : "فروشگاه همای"}
        </h1>
        <p>
          کالا، تجربه و اشتراک با مشخصات روشن؛ قیمت و موجودی از کاتالوگ واقعی
          مجموعه.
        </p>
      </div>
      {(cat || vertical === "craft" || vertical === "leather") && (
        <CraftNav cat={cat} tech={tech} item={item} />
      )}
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
          {menuSectors.map((k) => (
            <Localized key={k}><option value={k}>
              {menuLine(k)}
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
      <div className="shop-results" aria-busy={!state.data && !state.error}>
      <DataState state={state}>
        {(d) => (
          <Localized><>
            {d.grouped && d.rows.length ? (
              <div className="craft-groups">
                {craftCategories.map((c) => {
                  const rows = d.rows.filter((p: RecordData) => p.craft?.category === c.id);
                  if (!rows.length) return null;
                  return (
                    <Localized key={c.id}>
                      <section className="craft-group" aria-labelledby={`craft-group-${c.id}`}>
                        <header className="craft-group-head">
                          <h2 id={`craft-group-${c.id}`}>
                            {c.name} <span>({amount(rows.length)} محصول)</span>
                          </h2>
                          <a href={craftShopHref(c.id)}>مشاهدهٔ همه ←</a>
                        </header>
                        <div className="shop-grid">{rows.slice(0, 4).map(card)}</div>
                      </section>
                    </Localized>
                  );
                })}
                {d.rows.some((p: RecordData) => !p.craft?.category) && (
                  <section className="craft-group">
                    <header className="craft-group-head">
                      <h2>سایر محصولات</h2>
                    </header>
                    <div className="shop-grid">{d.rows.filter((p: RecordData) => !p.craft?.category).map(card)}</div>
                  </section>
                )}
              </div>
            ) : d.rows.length ? (
              <div className="shop-grid">
                {d.rows.map(card)}
              </div>
            ) : (
              <p className="shop-empty">
                هنوز محصول منتشرشده‌ای برای این انتخاب موجود نیست. پس از ثبت و
                انتشار محصول توسط مدیر، اینجا نمایش داده می‌شود.
              </p>
            )}
            {!d.grouped && <div className="commerce-pager">
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
            </div>}
          </></Localized>
        )}
      </DataState>
      </div>
    </div></Localized>
  );
}
