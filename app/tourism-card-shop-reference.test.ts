// @vitest-environment node
import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";

describe("reference-inspired tourism card gallery",()=>{
  it("keeps real prices and checkout controls rather than pasting a static screenshot",()=>{
    const jsx=readFileSync("app/TourismCardShop.tsx","utf8");
    expect(jsx).toContain('Number(product.price)');
    expect(jsx).toContain('id={String(product.id)} stock={0} onDemand');
    expect(jsx).toContain('href={"/shop/" + product.id}');
    expect(jsx).toContain('tourism-card-shop-reference.css');
  });
  it("matches the requested cream-and-gold reference with four plus three rows",()=>{
    const css=readFileSync("app/tourism-card-shop-reference.css","utf8");
    expect(css).toContain("grid-template-columns:repeat(12,minmax(0,1fr))");
    expect(css).toContain(".tourism-card-tile:nth-child(n+5)");
    expect(css).toContain("grid-column:span 4");
    expect(css).toContain("#fffdfa");
    expect(css).toContain("#dfcba7");
    expect(css).toContain("#035447");
    expect(css).toContain("@media(max-width:580px)");
    expect(css).toContain("prefers-reduced-motion:reduce");
  });
});
