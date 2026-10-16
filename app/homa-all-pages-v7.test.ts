import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("app/homa-all-pages-v7.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const portal = readFileSync("src/platform/Portal.tsx", "utf8");

describe("HOMA v7 common design tokens", () => {
  it("defines both day and night palettes with the same keys", () => {
    for (const mode of ["light", "dark"]) {
      const start = css.indexOf('html[data-theme="' + mode + '"]{');
      expect(start).toBeGreaterThan(-1);
      const block = css.slice(start, css.indexOf("\n}", start));
      for (const variable of ["--ha-page", "--ha-panel", "--ha-ink", "--ha-muted",
        "--ha-outline", "--ha-gold", "--ha-header", "--ha-input"]) {
        expect(block, mode + " " + variable).toContain(variable + ":");
      }
    }
  });

  it("loads last, so shared tokens can override older page-specific CSS", () => {
    const index = layout.indexOf("import './homa-all-pages-v7.css';");
    expect(index).toBeGreaterThan(layout.indexOf("import './homa-unified-theme.css';"));
    expect(index).toBeGreaterThan(layout.indexOf("import './premium-system.css';"));
  });

  it("styles the public shop, cart, ranks, user panel and admin workspace", () => {
    for (const selector of [".shop-card", ".cart-summary", ".rank-card", ".portal-title",
      ".admin-welcome", ".admin-shortcuts", ".registration-story",
      ".landing-footer", ".commerce-footer", ".portal-unified-footer"]) {
      expect(css, selector).toContain(selector);
    }
    expect(portal).toContain('className="portal-unified-footer"');
  });

  it("preserves accessible focus, reduced motion and narrow mobile layouts", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion:reduce");
    expect(css).toContain("@media(max-width:550px)");
    expect(css).toContain("overflow-x:auto");
  });
});
