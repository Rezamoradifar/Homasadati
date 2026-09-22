import { expect, test } from "vitest";
import { parseAmount, readPath, validRate } from "./fx";

test("parses rate values written with separators and Persian digits", () => {
  expect(parseAmount("1,050,000")).toBe(1050000);
  expect(parseAmount("۱٬۰۵۰٬۰۰۰")).toBe(1050000);
  expect(parseAmount(105000)).toBe(105000);
  expect(parseAmount("n/a")).toBeNaN();
});

test("reads the rate from common response shapes", () => {
  expect(readPath({ usd_sell: { value: "105000" } }, "usd_sell.value")).toBe("105000");
  expect(readPath({ data: [{ price: 7 }] }, "data.0.price")).toBe(7);
  expect(readPath({ currency: [{ symbol: "EUR", price: 1 }, { symbol: "USD", price: 2 }] }, "currency[symbol=USD].price")).toBe(2);
  expect(readPath({ a: 1 }, "b.c")).toBeUndefined();
});

test("rejects implausible rial-per-dollar rates", () => {
  expect(validRate(1_050_000)).toBe(true);
  expect(validRate(42)).toBe(false);
  expect(validRate(NaN)).toBe(false);
});
