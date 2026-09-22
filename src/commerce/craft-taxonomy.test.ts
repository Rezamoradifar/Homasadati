import { expect, test } from "vitest";
import { craftShopHref, validCraftPath } from "./craft-taxonomy";

test("accepts only technique and item paths that belong to the category", () => {
  expect(validCraftPath("", "", "")).toBe(true);
  expect(validCraftPath("copper", "khatam", "sugar-bowl")).toBe(true);
  expect(validCraftPath("leather", "", "belt")).toBe(true);
  expect(validCraftPath("leather", "khatam", "")).toBe(false);
  expect(validCraftPath("copper", "", "belt")).toBe(false);
  expect(validCraftPath("", "khatam", "")).toBe(false);
  expect(validCraftPath("gold", "", "")).toBe(false);
});

test("links every category, leather included, through the handicrafts shop", () => {
  expect(craftShopHref("leather", "", "bag")).toBe("/shop?vertical=craft&cat=leather&item=bag");
  expect(craftShopHref("copper", "pardaz", "vase")).toBe("/shop?vertical=craft&cat=copper&tech=pardaz&item=vase");
});
