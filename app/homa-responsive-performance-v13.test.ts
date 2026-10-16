import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const css = read("app/homa-responsive-performance-v13.css");
const home = read("app/PremiumHomeExact.tsx");
const tourism = read("app/TourismExperienceLanding.tsx");
const hook = read("src/components/media/useHeroPerformance.ts");
const layout = read("app/layout.tsx");

describe("HOMA V13 responsive coverage", () => {
  it("fixes the 768–800px mobile-admin breakpoint conflict without hiding navigation", () => {
    expect(css).toContain("@media (max-width:800px)");
    expect(css).toContain(".portal.portal-admin .portal-layout");
    expect(css).toContain("grid-template-columns:minmax(0,1fr)!important");
    expect(css).toContain(".portal.portal-admin .admin-menu-toggle");
    expect(css).toContain(".admin-navigation.is-open nav");
    expect(css).toContain("max-height:48svh");
  });

  it("prevents fixed-height mobile hero clipping and preserves the two original navigation layers", () => {
    expect(css).toContain(".hex-hero-architecture");
    expect(css).toContain("height:auto!important");
    expect(css).toContain("min-height:clamp(660px,115svh,800px)!important");
    expect(css).toContain(".hex-hero-body");
    expect(css).toContain(".hex-hero-pagination");
    expect(css).toContain(".hex-phoenix");
    expect(css).toContain(".homa-heritage-3d");
    expect(home).toContain('className="hex-hero-pagination"');
    expect(home).toContain('href="/shop"');
  });

  it("keeps store purchase controls, checkout, product details, tables and footer usable on phones", () => {
    for (const selector of [".shop-grid", ".shop-card", ".shop-toolbar", ".store-cta",
      ".product-page", ".checkout-page", ".commerce-footer-compact",
      ".portal-table-wrap", ".portal .portal-stats"]) {
      expect(css, selector).toContain(selector);
    }
    expect(css).toContain("overflow-x:auto");
    expect(css).toContain("overscroll-behavior-x:contain");
    expect(css).toContain("min-height:44px");
    expect(read("src/commerce/Storefront.tsx")).toContain("<AddToCart id={p.id} stock={p.stock} />");
  });

  it("supports small phones, tablets and laptop galleries without damaging the original logo", () => {
    for (const bp of ["max-width:390px", "max-width:767px", "max-width:800px",
      "min-width:801px", "max-width:959px", "min-width:768px", "max-width:1023px"]) {
      expect(css, bp).toContain(bp);
    }
    expect(read("src/commerce/SiteHeader.tsx")).toContain('settings.site_logo || "/assets/brand-mark.png"');
    expect(layout.indexOf("import './homa-responsive-performance-v13.css';")).toBeGreaterThan(
      layout.indexOf("import './homa-ambient-v12.css';")
    );
  });
});

describe("HOMA V13 image and animation budgets", () => {
  it("eagerly fetches only the first main hero LCP background with a reduced quality setting", () => {
    expect(home).toContain('loading={slide === 0 ? "eager" : "lazy"}');
    expect(home).toContain('fetchPriority={slide === 0 ? "high" : "auto"}');
    expect(home).toContain('quality={68}');
    expect(home).toContain('loading="eager" fetchPriority="auto" quality={70}');
    expect(tourism).toContain('fetchPriority="high"');
    expect(tourism).toContain('loading="eager"');
    expect(tourism).toContain('quality={68}');
    expect(tourism).toContain('loading="lazy"');
    expect(tourism).toContain('quality={66}');
    expect(read("src/commerce/ProductGallery.tsx")).toContain('fetchPriority="high"');
    expect(read("src/commerce/ProductGallery.tsx")).toContain('quality={55}');
    expect(read("src/commerce/Storefront.tsx")).toContain('quality={68}');
    expect(home).toContain('alt={p.title} loading="lazy" sizes="(max-width:700px) 46vw, 18vw" quality={68}');

  });

  it("pauses animation when offscreen, hidden, Save-Data or reduced-motion are active", () => {
    for (const marker of ["IntersectionObserver", "visibilitychange", "isIntersecting",
      "prefers-reduced-motion: reduce", "saveData", "data", "requestAnimationFrame",
      "cancelAnimationFrame", "onPointerLeave"]) {
      expect(hook, marker).toContain(marker);
    }
    expect(home).toContain("useHeroPerformance()");
    expect(home).toContain("onPointerMove={onPointerMove}");
    expect(home).toContain("onPointerLeave={onPointerLeave}");
    expect(css).toContain('[data-homa-motion="paused"]');
    expect(css).toContain("animation-play-state:paused!important");
    expect(css).toContain("prefers-reduced-data: reduce");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("skips offscreen paint with intrinsic-size estimates and retains important content", () => {
    expect(css).toContain("@supports (content-visibility:auto)");
    expect(css).toContain("content-visibility:auto");
    expect(css).toContain("contain-intrinsic-size:auto 560px");
    expect(css).toContain(".hex-middle");
    expect(css).toContain(".hex-bottom");
    expect(css).toContain(".tourism-invitation");
    expect(home).toContain('src={site_logo || \'/assets/brand-mark.png\'}');
  });
});
