import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const page = read("app/worlds/[sector]/page.tsx");
const header = read("src/commerce/SiteHeader.tsx");
const shell = read("src/commerce/Shell.tsx");
const css = read("app/homa-tourism-immersive-v11.css");
const landing = read("app/TourismExperienceLanding.tsx");

describe("tourism-only V11 page integration", () => {
  it("renders tourism only in the existing tourism URL and keeps other sectors intact", () => {
    expect(page).toContain('k === "tourism" ? (');
    expect(page).toContain("<TourismExperienceLanding />");
    expect(page).toContain('<section\n          className={`brand-hero');
    expect(page).toContain("BrandCollection sector={k}");
    expect(page).toContain("TourismMedia");
    expect(page).toContain("ClubCards");
    expect(page).toContain("Economics");
    expect(page).toContain("menuSectors");
    expect(page).toContain('<CommerceShell tourism={k === "tourism"}>');
  });

  it("reuses the original configured logo and global mobile navigation", () => {
    expect(header).toContain('settings.site_logo || "/assets/brand-mark.png"');
    expect(header).toContain("tourism = false");
    expect(header).toContain("discovery-menu-travel-links");
    expect(header).toContain("travel.nav.destinations");
    expect(shell).toContain("tourism = false");
    expect(shell).toContain("<SiteHeader tourism={tourism} />");
    expect(shell).toContain("commerce-tourism");
  });

  it("has real Iranian photographic assets and zero invented tour prices", () => {
    for (const image of [
      "/assets/heritage/isfahan.webp",
      "/assets/heritage/lotfollah.webp",
      "/assets/heritage/garden.webp",
      "/assets/heritage/persepolis.webp",
      "/assets/heritage/yazd.webp",
      "/assets/heritage/tabriz.webp",
      "/assets/heritage/bam.webp",
      "/assets/tourism/northern-iran.svg",
      "/assets/tourism/kish-island.svg",
    ]) {
      expect(existsSync("public" + image), image).toBe(true);
    }
    expect(landing).toContain('fetch("/api/requests"');
    expect(landing).toContain('kind: "enquiry"');
    expect(landing).toContain('"Idempotency-Key"');
    expect(landing).toContain('consent: true');
    expect(landing).toContain('"IRR"');
    expect(landing).toContain('"/shop?vertical=tourism"');
    expect(landing).not.toContain('"/assets/tourism-wide.jpg"');
    expect(landing).not.toContain('"/assets/tourism.jpg"');
    expect(landing).not.toMatch(/\/api\/checkout|\/api\/payment/);
  });

  it("scopes every change to this page and supports mobile and laptop widths", () => {
    expect(css).toContain(".commerce.commerce-tourism");
    expect(css).toContain(".tourism-hero");
    expect(css).toContain(".tourism-destination-grid");
    expect(css).toContain(".tourism-experience-grid");
    expect(css).toContain("@media (max-width:1100px)");
    expect(css).toContain("@media (max-width:767px)");
    expect(css).toContain("@media (max-width:420px)");
    expect(css).toContain("prefers-reduced-motion:reduce");
    const globalCss = read("app/layout.tsx");
    expect(globalCss.indexOf("import './homa-tourism-immersive-v11.css';")).toBeGreaterThan(
      globalCss.indexOf("import './homa-home-tourism-v10.css';")
    );
  });

  it("provides complete translations in three existing supported languages", () => {
    const strings = JSON.parse(read("app/tourism-experience-copy.json"));
    for (const locale of ["fa","en","ar"]) {
      expect(strings[locale].nav.home.length).toBeGreaterThan(2);
      expect(strings[locale].hero.disclaimer.length).toBeGreaterThan(8);
      expect(Object.keys(strings[locale].destinations)).toEqual(["shiraz","isfahan","persepolis","north","kish"]);
      expect(Object.keys(strings[locale].experiences)).toEqual(["nature","culture","food","stay"]);
      expect(strings[locale].inquiry.tracking.length).toBeGreaterThan(2);
    }
  });
});
