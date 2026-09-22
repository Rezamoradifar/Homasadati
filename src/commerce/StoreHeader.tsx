"use client";
import { useEffect, useRef, useState } from "react";
import { List, MagnifyingGlass, ShoppingCart, User, X } from "@phosphor-icons/react";
import Localized from "../i18n/Localized";
import { LanguagePicker } from "../i18n/SiteLocale";
import ThemeToggle from "./ThemeToggle";
import { useBasket } from "./basket";
import { brands, menuSectors, type Sector } from "./brands";
import { craftCategories, craftShopHref, itemsFor } from "./craft-taxonomy";

const serviceLinks: [string, string][] = [
  ["/club", "باشگاه مشتریان"],
  ["/club/ranks", "هفت رتبهٔ باشگاه"],
  ["/income-plan", "طرح درآمد"],
  ["/merchants", "پذیرندگان"],
];

/** Store-style header: logo, search, account and cart on top; a category
 * mega menu and the main sections below. One header for every page. */
export default function StoreHeader({ onJoin }: { onJoin?: () => void }) {
  const { items } = useBasket();
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [sector, setSector] = useState<Sector>("craft");
  const categories = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !categories.current?.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  return (
    <Localized>
      <header className="store-header">
        <div className="store-top">
          <button
            className="store-drawer-toggle"
            onClick={() => setDrawer(!drawer)}
            aria-expanded={drawer}
            aria-controls="store-drawer"
            aria-label={drawer ? "بستن منو" : "منو"}
          >
            {drawer ? <X size={24} /> : <List size={24} />}
          </button>
          <a className="store-logo" href="/">
            <img src="/assets/brand-mark.png" alt="" width={44} height={44} />
            <span>
              <strong>همای سعادت</strong>
              <small>باشگاه مشتریان</small>
            </span>
          </a>
          <form className="store-search" action="/shop" role="search">
            <MagnifyingGlass size={20} aria-hidden="true" />
            <input name="q" type="search" maxLength={200} placeholder="جست‌وجو در محصولات همای" aria-label="جست‌وجوی محصول" />
          </form>
          <div className="store-actions">
            <LanguagePicker />
            <ThemeToggle />
            <a className="store-account" href="/account">
              <User size={20} aria-hidden="true" />
              <span>حساب کاربری</span>
            </a>
            <span className="store-divider" aria-hidden="true" />
            <a className="store-cart" href="/cart" aria-label="سبد خرید">
              <ShoppingCart size={24} aria-hidden="true" />
              {count > 0 && <span className="store-cart-count">{count.toLocaleString("fa-IR")}</span>}
            </a>
          </div>
        </div>
        <nav className="store-nav" aria-label="بخش‌های سایت">
          <div className="store-categories" ref={categories} onMouseLeave={() => setMenuOpen(false)}>
            <button
              className="store-categories-button"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
              onMouseEnter={() => setMenuOpen(true)}
            >
              <List size={18} aria-hidden="true" />
              دسته‌بندی محصولات
            </button>
            {menuOpen && (
              <div className="store-mega">
                <ul className="store-mega-sectors">
                  {menuSectors.map((k) => (
                    <Localized key={k}>
                      <li>
                        <a
                          href={`/worlds/${k}`}
                          onMouseEnter={() => setSector(k)}
                          onFocus={() => setSector(k)}
                          aria-current={sector === k ? "true" : undefined}
                        >
                          {brands[k].label}
                        </a>
                      </li>
                    </Localized>
                  ))}
                </ul>
                <div className="store-mega-panel">
                  <a className="store-mega-all" href={sector === "craft" ? "/shop?vertical=craft" : `/shop?vertical=${sector}`}>
                    همهٔ محصولات {brands[sector].label} ›
                  </a>
                  {sector === "craft" ? (
                    <div className="store-mega-columns">
                      {craftCategories.map((c) => (
                        <Localized key={c.id}>
                          <div>
                            <a className="store-mega-title" href={craftShopHref(c.id)}>
                              {c.name} ›
                            </a>
                            {c.techniques?.map((t) => (
                              <Localized key={t.id}>
                                <a href={craftShopHref(c.id, t.id)}>{t.name}</a>
                              </Localized>
                            ))}
                            {!c.techniques &&
                              itemsFor(c).map((i) => (
                                <Localized key={i.id}>
                                  <a href={craftShopHref(c.id, "", i.id)}>{i.name}</a>
                                </Localized>
                              ))}
                          </div>
                        </Localized>
                      ))}
                      <div>
                        <span className="store-mega-title">انواع محصولات مس</span>
                        {itemsFor(craftCategories[0]).map((i) => (
                          <Localized key={i.id}>
                            <a href={craftShopHref("copper", i.onlyWith?.[0] || "", i.id)}>{i.name}</a>
                          </Localized>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="store-mega-note">{brands[sector].tagline}</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <span className="store-nav-sep" aria-hidden="true" />
          {menuSectors.map((k) => (
            <Localized key={k}>
              <a href={`/worlds/${k}`}>{brands[k].label}</a>
            </Localized>
          ))}
          <span className="store-nav-sep" aria-hidden="true" />
          {serviceLinks.map(([href, label]) => (
            <Localized key={href}>
              <a href={href}>{label}</a>
            </Localized>
          ))}
          <div className="store-nav-end">
            <a href="/help">راهنمای خرید</a>
            <a href="/contact">ارتباط با ما</a>
            {onJoin && (
              <button className="store-join" onClick={onJoin}>
                عضویت در باشگاه
              </button>
            )}
          </div>
        </nav>
        {drawer && (
          <nav id="store-drawer" className="store-drawer" aria-label="منوی سایت">
            {menuSectors.map((k) => (
              <Localized key={k}>
                <details open={k === "craft"}>
                  <summary>{brands[k].label}</summary>
                  <a href={`/worlds/${k}`}>معرفی {brands[k].name}</a>
                  <a href={`/shop?vertical=${k}`}>همهٔ محصولات</a>
                  {k === "craft" &&
                    craftCategories.map((c) => (
                      <Localized key={c.id}>
                        <a href={craftShopHref(c.id)}>{c.name}</a>
                      </Localized>
                    ))}
                </details>
              </Localized>
            ))}
            {serviceLinks.map(([href, label]) => (
              <Localized key={href}>
                <a href={href}>{label}</a>
              </Localized>
            ))}
            <a href="/help">راهنمای خرید</a>
            <a href="/contact">ارتباط با ما</a>
            {onJoin && (
              <button className="store-join" onClick={onJoin}>
                عضویت در باشگاه
              </button>
            )}
          </nav>
        )}
      </header>
    </Localized>
  );
}

