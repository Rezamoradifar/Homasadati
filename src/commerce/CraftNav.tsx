"use client";
import Localized from "../i18n/Localized";
import { craftCategories, craftCategory, craftShopHref, itemsFor } from "./craft-taxonomy";

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
  return (
    <Localized>
      <nav className="craft-nav" aria-label="دسته‌بندی صنایع‌دستی">
        {heading && <h2>{heading}</h2>}
        <div className="craft-nav-row">
          {craftCategories.map((c) => (
            <Localized key={c.id}>
              <a href={craftShopHref(c.id)} aria-current={c.id === cat ? "page" : undefined}>
                {c.name}
              </a>
            </Localized>
          ))}
        </div>
        {current?.techniques && (
          <div className="craft-nav-row craft-nav-sub">
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
          {craftCategories.map((c) => (
            <Localized key={c.id}>
              <article>
                <h3>
                  <a href={craftShopHref(c.id)}>{c.name}</a>
                </h3>
                {c.techniques ? (
                  <ul>
                    {c.techniques.map((t) => (
                      <Localized key={t.id}>
                        <li>
                          <a href={craftShopHref(c.id, t.id)}>{t.name}</a>
                        </li>
                      </Localized>
                    ))}
                  </ul>
                ) : c.items ? (
                  <ul>
                    {c.items.map((i) => (
                      <Localized key={i.id}>
                        <li>
                          <a href={craftShopHref(c.id, "", i.id)}>{i.name}</a>
                        </li>
                      </Localized>
                    ))}
                  </ul>
                ) : null}
                {c.techniques && c.items && (
                  <p className="craft-item-tags">
                    {c.items.map((i) => (
                      <Localized key={i.id}>
                        <span>{i.name}</span>
                      </Localized>
                    ))}
                  </p>
                )}
                <a className="craft-category-link" href={craftShopHref(c.id)}>
                  مشاهدهٔ محصولات ←
                </a>
              </article>
            </Localized>
          ))}
        </div>
      </section>
    </Localized>
  );
}
