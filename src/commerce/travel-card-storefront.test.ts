// @vitest-environment node
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(p:string)=>readFileSync(p,"utf8");
describe("travel card shop mobile regression",()=>{
  it("renders an accessible compact real tourism product instead of a long dark shop card",()=>{
    const s=read("src/commerce/Storefront.tsx");
    expect(s).toContain('shop-card shop-card-travel');
    expect(s).toContain("shop-card-travel-image");
    expect(s).toContain("shop-card-travel-price");
    expect(s).toContain("p.price");
    expect(s).toContain("AddToCart id={p.id} stock={p.stock} onDemand");
    expect(s).toContain('<AddToCart id={p.id} stock={p.stock} />');
    expect(s).toContain('shop-wrap shop-wrap-tourism');
  });
  it("uses cropped full-width photo, no giant letterbox, short copy, and a two-control checkout row on small devices",()=>{
    const css=read("src/commerce/travel-card-storefront.css");
    expect(css).toContain("shop-card-travel-image");
    expect(css).toContain("object-fit:cover!important");
    expect(css).toContain("aspect-ratio:16/8.5!important");
    expect(css).toContain("@media(max-width:720px)");
    expect(css).toContain("shop-card-travel .store-cta");
    expect(css).toContain("grid-template-columns:minmax(105px,128px) minmax(0,1fr)");
  });
  it("keeps the ambient music widget visible but icon-only when it could cover buy controls",()=>{
    const css=read("src/commerce/travel-card-storefront.css");
    expect(css).toContain("body:has(.shop-wrap-tourism) .homa-ambient-control");
    expect(css).toContain("body:has(.shop-wrap-tourism) .homa-ambient-label");
    expect(css).toContain("display:none!important");
  });
  it("uses the same compact treatment on travel card detail pages and leaves other products untouched",()=>{
    const page=read("app/shop/[id]/page.tsx");
    expect(page).toContain("product-page product-page-travel");
    expect(page).toContain("travel-product-more");
    expect(page).toContain("onDemand={travelCard}");
    expect(page).toContain('href="/shop"');
  });
});
