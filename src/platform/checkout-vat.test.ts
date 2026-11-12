// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { digipayVatEnabled, digipayVatForLine, digipayVatFromOrder } from "./checkout-vat";
afterEach(() => vi.unstubAllEnvs());
it("does not add VAT before explicit server activation", () => {
  vi.stubEnv("HOMA_DIGIPAY_VAT_ENABLED", "0");
  expect(digipayVatEnabled()).toBe(false);
  expect(digipayVatForLine(100_000,'{"vatStatus":"taxable"}')).toEqual({status:"disabled",vatToman:0});
});
it("requires classification and exempts approved lines", () => {
  vi.stubEnv("HOMA_DIGIPAY_VAT_ENABLED", "1");
  expect(digipayVatForLine(100_000,null)).toEqual({status:"review",vatToman:0});
  expect(digipayVatForLine(100_000,'{"vatStatus":"exempt"}')).toEqual({status:"exempt",vatToman:0});
  expect(digipayVatForLine(250_005,'{"vatStatus":"taxable"}')).toEqual({status:"taxable",vatToman:25001});
});
it("keeps the original tax snapshot for refunds, including legacy orders", () => {
  const order={amount:100_000,policy:'{"orderTerms":{"digipayVatToman":10000}}'};
  expect(digipayVatFromOrder(order)).toBe(10_000);
  vi.stubEnv("HOMA_DIGIPAY_VAT_ENABLED", "0");
  expect(digipayVatFromOrder(order)).toBe(10_000);
  expect(digipayVatFromOrder({amount:100_000,policy:'{"orderTerms":{}}'})).toBe(0);
  expect(() => digipayVatFromOrder({amount:100_000,policy:'{"orderTerms":{"digipayVatToman":20000}}'})).toThrow("invalid_order_tax_snapshot");
});

it("applies VAT to taxable goods across all checkout payment methods",()=>{
  vi.stubEnv("HOMA_CHECKOUT_VAT_ENABLED","1");
  expect(digipayVatEnabled()).toBe(true);
  expect(digipayVatForLine(100_000,'{"vatStatus":"taxable"}').vatToman).toBe(10_000);
});
