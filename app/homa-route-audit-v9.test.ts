import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Structural and source-level audit. It is not a substitute for a real browser
 * screenshot pass: no customer account or live payment is used by this test.
 */
const routeFiles = [
  "app/page.tsx",
  "app/about/page.tsx",
  "app/account/page.tsx",
  "app/admin/page.tsx",
  "app/admin/legacy/page.tsx",
  "app/cart/page.tsx",
  "app/club/page.tsx",
  "app/club/ranks/page.tsx",
  "app/contact/page.tsx",
  "app/help/page.tsx",
  "app/heritage/page.tsx",
  "app/income-plan/page.tsx",
  "app/income-plan/presentation/page.tsx",
  "app/legal/[document]/page.tsx",
  "app/member-kit/page.tsx",
  "app/merchants/page.tsx",
  "app/pages/[slug]/page.tsx",
  "app/payment/result/page.tsx",
  "app/register/page.tsx",
  "app/shop/[id]/page.tsx",
  "app/shop/page.tsx",
  "app/support/page.tsx",
  "app/unsubscribe/page.tsx",
  "app/worlds/[sector]/page.tsx",
];
const read = (path: string) => readFileSync(path, "utf8");

function pages(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? pages(path)
      : entry.name === "page.tsx" ? [path.split("\\").join("/")] : [];
  });
}

describe("route-by-route HOMA V9 page shell audit", () => {
  it("accounts for every route in the application, not just the homepage", () => {
    const found = pages("app").sort();
    expect(found).toEqual([...routeFiles].sort());
    expect(found).toHaveLength(24);
  });

  it.each(routeFiles)("%s uses a shared site experience", path => {
    const code = read(path);
    expect(
      code.includes("<CommerceShell") ||
      code.includes("<Portal") ||
      code.includes("<HomeLanding"),
      path + " must not be left with unthemed stand-alone chrome",
    ).toBe(true);
  });

  it("keeps live user/admin views and commerce operations in their existing implementations", () => {
    expect(read("app/account/page.tsx")).toContain("<Portal");
    expect(read("app/admin/page.tsx")).toContain("<Portal admin");
    expect(read("app/cart/page.tsx")).toContain("<Cart");
    expect(read("app/shop/page.tsx")).toContain("<Storefront");
    expect(read("app/payment/result/page.tsx")).toContain("<PaymentResult");
    expect(read("app/shop/[id]/page.tsx")).toContain("Money");
    expect(read("app/worlds/[sector]/page.tsx")).toContain("isSector");
  });

  it("keeps standalone route business handlers unchanged while restoring common page framing", () => {
    expect(read("app/register/page.tsx")).toContain("<RegistrationEntry");
    expect(read("src/platform/RegistrationEntry.tsx")).toContain('window.location.assign("/account")');
    expect(read("src/platform/Registration.tsx")).toContain('api("auth/register"');

    expect(read("app/unsubscribe/page.tsx")).toContain("<UnsubscribeForm");
    expect(read("src/commerce/UnsubscribeForm.tsx")).toContain("fetch('/api/unsubscribe'");
    expect(read("src/commerce/UnsubscribeForm.tsx")).toContain("JSON.stringify({token})");

    expect(read("app/admin/legacy/page.tsx")).toContain("<LegacyPanel");
    const legacy=read("app/admin/legacy/LegacyPanel.tsx");
    expect(legacy).toContain("fetch('/api/admin/session'");
    expect(legacy).toContain("fetch('/api/admin/records'");
    expect(legacy).toContain("exportCSV");

    expect(read("app/income-plan/presentation/page.tsx")).toContain("<PlanPresentation");
    expect(read("src/commerce/PlanPresentation.tsx")).toContain('aria-label="اسلایدهای ارائه"');
  });

  it("published content retains database-backed content and its 404 behavior", () => {
    const cms=read("app/pages/[slug]/page.tsx");
    expect(cms).toContain("SELECT * FROM p_content WHERE slug=? AND published=1");
    expect(cms).toContain("if (!p) notFound()");
    expect(cms).toContain("{p.title}");
    expect(cms).toContain("{p.body}");
    expect(cms).toContain("{p.image}");
    expect(cms).toContain('className="editorial-content-card"');
    expect(cms).not.toMatch(/color:\s*["']#[a-f0-9]{6}/i);
  });

  it("protects all audited route families at tablet, laptop and phone sizes", () => {
    const css=read("app/homa-route-audit-v9.css");
    const all=[
      ".editorial-content-page",".portal-registration-page",".unsubscribe-page",
      ".admin-legacy-page",".plan-presentation-page",".help-page",
      ".club-public-page",".merchants-public-page",".member-kit-public-page",
      ".worlds-public-page",".product-page",".checkout-page",".payment-result",
      ".portal-admin",".site-error"
    ];
    for(const selector of all) expect(css, selector).toContain(selector);
    expect(css).toContain("min-width:768px");
    expect(css).toContain("max-width:1199px");
    expect(css).toContain("max-width:767px");
    expect(css).toContain("max-width:380px");
    expect(css).toContain("overflow-x:auto");
    expect(css).toContain("prefers-reduced-motion:reduce");
    expect(css).toContain('html[data-theme="dark"]');
    expect(css).toContain('html[data-theme="light"]');
    expect(read("app/layout.tsx")).toContain("import './homa-route-audit-v9.css';");
  });

  it("the original configured brand assets and seven-card financial model remain untouched", () => {
    expect(read("src/commerce/SiteHeader.tsx")).toContain('settings.site_logo || "/assets/brand-mark.png"');
    expect(read("src/commerce/FooterBrandLogo.tsx")).toContain('site.site_logo || "/assets/brand-mark.png"');
    expect(read("src/platform/Portal.tsx")).toContain('site.site_logo || "/assets/brand-mark.png"');
    expect(read("src/commerce/PlanPresentation.tsx")).toContain('from "../platform/card-levels"');
  });
});
