import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(p, "utf8");
const removed = [
  "public/assets/tourism.jpg",
  "public/assets/tourism-wide.jpg",
  "public/assets/hero.jpg",
  "public/assets/beauty.jpg",
  "public/assets/collections/beauty-portrait.webp",
  "public/assets/collections/ai-human.webp",
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(ts|tsx|mjs|css|json)$/.test(path) && !/\.(test|stories)\./.test(path) ? [path] : [];
  });
}

describe("HOMA V12 no-woman architecture-first hero", () => {
  it("removes the old female-model files from public assets", () => {
    for (const file of removed) expect(existsSync(file),file).toBe(false);
  });

  it("contains no stale links to the deleted portraits in runtime code", () => {
    const filenames = removed.map(x=>x.slice("public/assets/".length));
    const stale = walk("app").concat(walk("src"))
      .filter(path => !path.endsWith("retired-image-aliases.ts"))
      .flatMap(path => {
      const content = read(path);
      return filenames.filter(name => content.includes(name)).map(name => path + ": " + name);
    });
    expect(stale).toEqual([]);
  });

  it("maps existing product media safely without editing database records", async () => {
    const { safeMediaSrc } = await import("../src/components/media/retired-image-aliases");
    expect(safeMediaSrc("/assets/collections/beauty-portrait.webp")).toBe("/assets/collections/beauty-care.webp");
    expect(safeMediaSrc("/assets/tourism.jpg")).toBe("/assets/backdrop/persepolis.webp");
    expect(safeMediaSrc("/api/platform/media/123.webp")).toBe("/api/platform/media/123.webp");
    expect(safeMediaSrc("https://images.example/item.jpg")).toBe("https://images.example/item.jpg");
  });

  it("renders a stone Persian heritage monument within the original hero", () => {
    const home = read("app/PremiumHomeExact.tsx");
    const css = read("app/homa-heritage-live-v12.css");
    expect(home).toContain('/assets/backdrop/persepolis.webp');
    expect(home).toContain('homa-heritage-3d');
    expect(home).toContain('homa-heritage-glass');
    expect(home).toContain('homa-heritage-rim');
    expect(home).toContain('homa-heritage-light');
    expect(home).toContain('onPointerMove');
    expect(css).toContain('homa-heritage-reflection');
    expect(css).toContain('homa-heritage-inner-focus');
    expect(css).toContain('prefers-reduced-motion:reduce');
    expect(css).toContain('max-width:760px');
    expect(existsSync("public/assets/backdrop/persepolis.webp")).toBe(true);
  });

  it("keeps the logo, authentic customer catalog and purchase controls", () => {
    const home = read("app/PremiumHomeExact.tsx");
    const sharedHeader = read("src/commerce/SiteHeader.tsx");
    expect(home).toContain('src={site_logo || \'/assets/brand-mark.png\'}');
    expect(sharedHeader).toContain('settings.site_logo || "/assets/brand-mark.png"');
    expect(home).toContain('<AddToCart id={p.id} stock={p.stock}/>');
    expect(home).toContain('<Money toman={p.price}/>');
    expect(read("app/TourismExperienceLanding.tsx")).toContain('fetch("/api/requests"');
  });

  it("loads architecture and the shared music control after existing styles", () => {
    const layout=read("app/layout.tsx");
    expect(layout).toContain("import HomaAmbientMusic");
    expect(layout).toContain("<HomaAmbientMusic/>");
    expect(layout.indexOf("import './homa-heritage-live-v12.css';")).toBeGreaterThan(
      layout.indexOf("import './homa-tourism-immersive-v11.css';")
    );
    expect(layout).toContain("import './homa-ambient-v12.css';");
  });
});
