// @vitest-environment node
import {expect,it} from "vitest";
import {isTravelCardProduct} from "./travel-card-product";
it("distinguishes made-to-order cards from actual tours",()=>{
  expect(isTravelCardProduct({vertical:"tourism",subtype:"کارت گردشگری",title:"جوانه"})).toBe(true);
  expect(isTravelCardProduct({vertical:"tourism",subtype:"product",title:"کارت سفر سرو"})).toBe(true);
  expect(isTravelCardProduct({vertical:"tourism",subtype:"تور",title:"تور اصفهان"})).toBe(false);
  expect(isTravelCardProduct({vertical:"craft",subtype:"کارت گردشگری"})).toBe(false);
});