import { expect, it } from "vitest";
import { productImage } from "./validation";

it("accepts only product photos that carry the site logo", () => {
  expect(productImage.safeParse("/assets/craft.jpg").success).toBe(true);
  expect(productImage.safeParse("/api/platform/media/0f8fad5b-d9cb-469f-a165-70867728950e.webp").success).toBe(true);
  expect(productImage.safeParse("https://example.com/photo.jpg").success).toBe(false);
  expect(productImage.safeParse("/api/platform/media/originals/x.webp").success).toBe(false);
});
