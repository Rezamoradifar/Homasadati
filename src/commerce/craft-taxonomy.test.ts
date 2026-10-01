import { describe, expect, it, test } from "vitest";
import { craftCategories, craftShopHref, effectiveCraft, validCraftPath } from "./craft-taxonomy";

const craft = (subtype: string, title: string, details = {}) => effectiveCraft({ vertical: "craft", subtype, title }, details);

describe("handicraft categories", () => {
  it("puts silver-inlay right after enamel", () => {
    const ids = craftCategories.map((c) => c.id);
    expect(ids.indexOf("silver-inlay")).toBe(ids.indexOf("enamel") + 1);
    expect(craftCategories.find((c) => c.id === "copper")!.techniques!.map((t) => t.id)).not.toContain("silver-inlay");
  });

  it("keeps what staff chose", () => {
    expect(craft("پرداز", "گلدان", { craftCategory: "copper", craftTechnique: "khatam", craftItem: "vase" })).toEqual({
      category: "copper",
      technique: "khatam",
      item: "vase",
    });
  });

  it("files untagged products by their type and title", () => {
    expect(craft("میناکاری", "قندان سایز ۲۲ مینا کاری")).toEqual({ category: "enamel", technique: "", item: "sugar-bowl" });
    expect(craft("نقره کاری", "ست شربت‌خوری نقره‌کاری")).toMatchObject({ category: "silver-inlay", item: "sherbet-set" });
    expect(craft("پرداز", "دیسگونی پرداز سایز 22")).toMatchObject({ category: "copper", technique: "pardaz" });
    expect(craft("قلم زنی", "تابلو قلم‌زنی")).toMatchObject({ category: "copper", technique: "engraving" });
    expect(craft("چرم", "کیف چرمی گلدوزی‌شده")).toMatchObject({ category: "leather", item: "bag" });
    expect(craft("چوب", "تخته نرد منبت")).toMatchObject({ category: "backgammon" });
    expect(craft("جعبه جواهر", "جعبه جواهر منبت‌کاری")).toMatchObject({ category: "wood" });
    expect(craft("خاتم کاری", "جعبه خاتم بزرگ")).toMatchObject({ category: "wood" });
    expect(craft("میناکاری", "ساعت مینا و خاتم روی چوب سایز ۴۰")).toMatchObject({ category: "enamel" });
  });

  it("moves old copper silver-inlay products to the silver-inlay category and keeps them editable", () => {
    expect(craft("", "قندان", { craftCategory: "copper", craftTechnique: "silver-inlay" })).toMatchObject({ category: "silver-inlay", technique: "" });
    expect(validCraftPath("copper", "silver-inlay", "")).toBe(true);
    expect(validCraftPath("silver-inlay", "", "vase")).toBe(true);
  });

  it("treats every leather-vertical product as leather and ignores other worlds", () => {
    expect(effectiveCraft({ vertical: "leather", subtype: "کیف پول", title: "کیف پول مردانه" })).toMatchObject({ category: "leather" });
    expect(effectiveCraft({ vertical: "beauty", subtype: "مراقبت", title: "کرم" })).toEqual({ category: "", technique: "", item: "" });
  });
});


test("accepts only technique and item paths that belong to the category", () => {
  expect(validCraftPath("", "", "")).toBe(true);
  expect(validCraftPath("copper", "khatam", "sugar-bowl")).toBe(true);
  expect(validCraftPath("leather", "", "belt")).toBe(true);
  expect(validCraftPath("leather", "khatam", "")).toBe(false);
  expect(validCraftPath("copper", "", "belt")).toBe(false);
  expect(validCraftPath("", "khatam", "")).toBe(false);
  expect(validCraftPath("gold", "", "")).toBe(false);
  expect(validCraftPath("copper", "turquoise", "samovar-tea-set")).toBe(true);
  expect(validCraftPath("copper", "khatam", "samovar-set")).toBe(true);
  expect(validCraftPath("copper", "pardaz", "samovar-set")).toBe(false);
  expect(validCraftPath("copper", "", "samovar-set")).toBe(false);
  expect(validCraftPath("enamel", "", "rosewater-sprinkler")).toBe(true);
  expect(validCraftPath("enamel", "", "laleh")).toBe(false);
});

test("links every category, leather included, through the handicrafts shop", () => {
  expect(craftShopHref("leather", "", "bag")).toBe("/shop?vertical=craft&cat=leather&item=bag");
  expect(craftShopHref("copper", "pardaz", "vase")).toBe("/shop?vertical=craft&cat=copper&tech=pardaz&item=vase");
});
