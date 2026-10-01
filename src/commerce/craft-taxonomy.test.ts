import { describe, expect, it } from "vitest";
import { craftCategories, effectiveCraft, validCraftPath } from "./craft-taxonomy";

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
