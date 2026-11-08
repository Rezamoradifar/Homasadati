import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const hero = readFileSync("app/PremiumHomeExact.tsx", "utf8");
const css = readFileSync("app/homa-home-tourism-v10.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");

describe("HOMA V10 homepage travel-first hero", () => {
  it("shows person-free Iranian architectural photography instead of the cosmetics mockup", () => {
    expect(hero).toContain('src="/assets/backdrop/persepolis.webp"');
    expect(hero).not.toContain('src="/assets/premium/hero-cosmetics.svg"');
    expect(hero).toContain('className="hex-hero-product hex-hero-tourism homa-heritage-3d"');
    expect(hero).toContain('className="hex-hero-product-frame hex-hero-tourism-frame"');
    expect(existsSync("public/assets/backdrop/persepolis.webp")).toBe(true);
  });

  it("starts the landing slideshow with a tourism landscape", () => {
    expect(hero).toMatch(/const slides = \[\s*'\/assets\/redesign\/tourism\.webp'/);
    expect(hero).toContain("<span>{c.travel}</span>");
    expect(existsSync("public/assets/redesign/tourism.webp")).toBe(true);
    expect(hero).toContain("slides.map((_,i)");
  });

  it("keeps shopping accessible while homepage content is editorial", () => {
    expect(hero).not.toContain("const liveProducts = useMemo");
    expect(hero).not.toContain("<AddToCart");
    expect(hero).toContain("<PublicContent />");
    expect(hero).toContain("href:'/shop'");
    expect(hero).toContain("src={site_logo || '/assets/brand-mark.png'}");
  });

  it("makes the architectural glass frame usable in light/dark themes and on mobile", () => {
    expect(css).toContain(".hex-hero-tourism-frame img");
    expect(css).toContain("object-fit:cover!important");
    expect(css).toContain("hex-hero-tourism-label");
    expect(css).toContain('html[data-theme="dark"]');
    expect(css).toContain("@media(max-width:760px)");
    expect(css).toContain("prefers-reduced-motion:reduce");
    expect(layout.indexOf("import './homa-home-tourism-v10.css';")).toBeGreaterThan(
      layout.indexOf("import './homa-route-audit-v9.css';")
    );
  });
});
