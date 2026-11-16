// @vitest-environment node
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { travelCardArtwork } from "../src/platform/travel-card-art";
import { sevenLevelCards } from "../src/platform/card-levels";

const read = (p: string) => readFileSync(p, "utf8");

describe("Homanet travel card storefront visuals", () => {
  it("gives each of the seven real card SKUs its own local photo", () => {
    expect(Object.keys(travelCardArtwork)).toHaveLength(7);
    expect(new Set(Object.values(travelCardArtwork)).size).toBe(7);
    for (const tier of sevenLevelCards) {
      const photo = travelCardArtwork[tier.level];
      expect(photo).toMatch(/^\/assets\//);
      expect(existsSync("public" + photo), photo).toBe(true);
    }
  });
  it("keeps actual buy controls and database-driven prices on every visual card", () => {
    const page = read("app/TourismCardShop.tsx");
    expect(page).toContain("bySku.get(travelCardSku(tier.level))");
    expect(page).toContain("Number(product.price)");
    expect(page).toContain('id={String(product.id)} stock={0} onDemand');
    expect(page).toContain("travelCardArtwork[tier.level]");
    expect(page).toContain('href={"/shop/" + product.id}');
    expect(page).toContain("tourism-card-photo");
    expect(page).not.toContain("href=\"/income-plan\"");
  });
  it("is readable on mobiles and supports reduced motion", () => {
    const css = read("app/tourism-card-shop.css");
    expect(css).toContain("grid-template-columns: repeat(4,minmax(0,1fr))");
    expect(css).toContain("grid-template-columns:minmax(0,1fr)");
    expect(css).toContain("@media(max-width:580px)");
    expect(css).toContain("prefers-reduced-motion:reduce");
    expect(css).toContain(".tourism-card-purchase .commerce-button");
  });
});
