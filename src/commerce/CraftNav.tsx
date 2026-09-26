"use client";
import { useEffect, useRef } from "react";
import { CookingPot, DiceFive, FlowerLotus, Handbag, Rug } from "@phosphor-icons/react";
import Localized from "../i18n/Localized";
import { craftCategories, craftCategory, craftShopHref, itemsFor } from "./craft-taxonomy";

const categoryIcons: Record<string, typeof CookingPot> = {
  copper: CookingPot,
  leather: Handbag,
  backgammon: DiceFive,
  carpet: Rug,
  enamel: FlowerLotus,
};

/** Handicraft category tree. With `active` values it marks the current
 * category, copper technique and item, and offers the next level down. */
export default function CraftNav({
  cat = "",
  tech = "",
  item = "",
  heading,
}: {
  cat?: string;
  tech?: string;
  item?: string;
  heading?: string;
}) {
  const current = craftCategory(cat);
  const nav = useRef<HTMLElement>(null);
  // Rows scroll sideways on phones; bring each row's chosen chip into view.
  useEffect(() => {
    nav.current?.querySelectorAll<HTMLElement>(".craft-nav-row").forEach((row) => {
      const chosen = row.querySelector<HTMLElement>("[aria-current=page]");
      if (!chosen) return;
      const rowBox = row.getBoundingClientRect(),
        box = chosen.getBoundingClientRect();
      if (box.left < rowBox.left || box.right > rowBox.right)
        row.scrollLeft += box.left + box.width / 2 - (rowBox.left + rowBox.width / 2);
    });
  }, [cat, tech, item]);
  return (
    <Localized>
      <nav ref={nav} className="craft-nav" aria-label="دسته‌بندی صنایع‌دستی">
        {heading && <h2>{heading}</h2>}
        <div className="craft-nav-cats">
          {craftCategories.map((c) => {
            const Icon = categoryIcons[c.id];
            return (
              <Localized key={c.id}>
                <a href={craftShopHref(c.id)} aria-current={c.id === cat ? "page" : undefined} title={c.name}>
                  <span className="craft-cat-icon" aria-hidden="true">
                    {Icon && <Icon weight="light" />}
                  </span>
                  <span>{c.short}</span>
                </a>
              </Localized>
            );
          })}
        </div>
        {current?.techniques && (
          <div className="craft-nav-techniques">
            <a href={craftShopHref(current.id)} aria-current={!tech ? "page" : undefined}>
              همهٔ تکنیک‌ها
            </a>
            {current.techniques.map((t) => (
              <Localized key={t.id}>
                <a href={craftShopHref(current.id, t.id)} aria-current={t.id === tech ? "page" : undefined}>
                  {t.name}
                </a>
              </Localized>
            ))}
          </div>
        )}
        {current?.items && (!current.techniques || tech) && (
          <div className="craft-nav-row craft-nav-items">
            <a href={craftShopHref(current.id, tech)} aria-current={!item ? "page" : undefined}>
              همهٔ محصولات
            </a>
            {itemsFor(current, tech).map((i) => (
              <Localized key={i.id}>
                <a href={craftShopHref(current.id, tech, i.id)} aria-current={i.id === item ? "page" : undefined}>
                  {i.name}
                </a>
              </Localized>
            ))}
          </div>
        )}
      </nav>
    </Localized>
  );
}

/** Overview of the whole tree for the handicrafts landing page. */
export function CraftCategoryGrid() {
  return (
    <Localized>
      <section className="craft-categories" id="craft-categories">
        <span className="commerce-eyebrow">دسته‌بندی محصولات</span>
        <h2>صنایع‌دستی همای</h2>
        <div className="craft-category-grid">
          {craftCategories.map((c) => {
            const Icon = categoryIcons[c.id];
            return (
              <Localized key={c.id}>
                <article>
                  <a className="craft-category-head" href={craftShopHref(c.id)}>
                    <span className="craft-cat-icon" aria-hidden="true">
                      {Icon && <Icon weight="light" />}
                    </span>
                    <h3>{c.name}</h3>
                  </a>
                  {c.techniques && (
                    <div className="craft-category-chips">
                      <small>تکنیک</small>
                      {c.techniques.map((t) => (
                        <Localized key={t.id}>
                          <a href={craftShopHref(c.id, t.id)}>{t.name}</a>
                        </Localized>
                      ))}
                    </div>
                  )}
                  {c.items && (
                    <div className="craft-category-chips craft-category-items">
                      <small>کاربری</small>
                      {c.items.map((i) => (
                        <Localized key={i.id}>
                          <a href={craftShopHref(c.id, "", i.id)}>{i.name}</a>
                        </Localized>
                      ))}
                    </div>
                  )}
                  <a className="craft-category-link" href={craftShopHref(c.id)}>
                    مشاهدهٔ محصولات ←
                  </a>
                </article>
              </Localized>
            );
          })}
        </div>
      </section>
    </Localized>
  );
}
