import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { localizeNode } from "./Localized";
import { translateText, isLocale, direction, formatDate } from "./core";
import en from "./en.json";
import ar from "./ar.json";
import { catalogCopy } from "./catalog";
import { clubTiers, tomanToRial, tierPriceRial } from "../commerce/club-tiers";
afterEach(cleanup);

describe("site language rendering", () => {
  it("keeps Persian as the default and restricts locale choices", () => {
    expect(translateText("ایمیل", "fa", en)).toBe("ایمیل");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("../en")).toBe(false);
    expect(direction("fa")).toBe("rtl");
    expect(direction("ar")).toBe("rtl");
    expect(direction("en")).toBe("ltr");
  });
  it("translates messages with dynamic values and preserves surrounding whitespace", () => {
    expect(translateText(" ایمیل ", "en", en)).toBe(" Email ");
    expect(translateText("ارسال مجدد تا ۳۰ ثانیه", "en", en)).toBe(
      "Resend in 30 seconds",
    );
    expect(translateText("ارسال مجدد تا ۳۰ ثانیه", "ar", ar)).toBe(
      "إعادة الإرسال بعد ٣٠ ثانية",
    );
    expect(translateText("متن جدید فروشنده", "en", en)).toBe(
      "متن جدید فروشنده",
    );
    expect(translateText("فروشگاه همای چرم", "en", en)).toBe(
      "Homa Leather shop",
    );
    expect(translateText("constructor", "en", en)).toBe("constructor");
    expect(translateText("فروشگاه $&", "en", en)).toBe("$& shop");
    expect(translateText("۱۰۰٬۰۰۰٬۰۰۰", "en", en)).toBe("100,000,000");
  });
  it("does not change field values, user data, IDs, links or handlers", () => {
    const submit = vi.fn();
    function Form() {
      const [value, setValue] = useState("ایمیل");
      return localizeNode(
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(value);
          }}
        >
          <label>
            ایمیل
            <input
              aria-label="ایمیل"
              name="ایمیل"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <p translate="no">ایمیل ۱۲۳</p>
          <button type="submit">ذخیره</button>
          <a href="/pages/ایمیل">ایمیل</a>
        </form>,
        "en",
        en,
      );
    }
    render(<Form />);
    const input = screen.getByRole("textbox", {
      name: "Email",
    }) as HTMLInputElement;
    expect(input.value).toBe("ایمیل");
    expect(input.name).toBe("ایمیل");
    expect(screen.getByText("ایمیل ۱۲۳")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/pages/ایمیل");
    fireEvent.change(input, { target: { value: "نام شخصی" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(submit).toHaveBeenCalledWith("نام شخصی");
  });
  it("retains existing Arabic coverage and validates placeholders in both dictionaries", () => {
    for (const key of Object.keys(ar))
      expect(Object.hasOwn(en, key), key).toBe(true);
    for (const dictionary of [en, ar])
      for (const [key, value] of Object.entries(dictionary)) {
        const placeholders = (s: string) => (s.match(/\{\d+\}/g) || []).sort();
        expect(value.trim(), key).not.toBe("");
        expect(placeholders(value), key).toEqual(placeholders(key));
      }
    for (const value of Object.values(en))
      expect(value).not.toMatch(/[\u0621-\u063a\u0641-\u064a\u0671-\u06d3]/);
  });
  it("translates complete point sentences in English word order", () => {
    expect(
      translateText(
        "برای هر ۱۰۰٬۰۰۰ تومان خرید، ۳ امتیاز به شما تعلق می‌گیرد.",
        "en",
        en,
      ),
    ).toBe("Earn 3 points for every 100,000 tomans spent.");
    render(localizeNode(<p>· {5} کد بازیابی باقی مانده</p>, "en", en));
    expect(screen.getByText("· Recovery codes remaining: 5")).toBeTruthy();
  });
  it("preserves option values and uncontrolled input state when switching language", () => {
    const form = (
      <div>
        <label>
          ایمیل <input defaultValue="" />
        </label>
        <select defaultValue="گردشگری">
          <option>گردشگری</option>
          <option>زیبایی</option>
        </select>
      </div>
    );
    const view = render(localizeNode(form, "fa", {}));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "private@example.test" } });
    view.rerender(localizeNode(form, "en", en));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "private@example.test",
    );
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
      "گردشگری",
    );
    expect(
      screen.getByRole("option", { name: "Tourism" }).getAttribute("value"),
    ).toBe("گردشگری");
  });
  it("uses Gregorian English dates while retaining Persian dates and Tehran time", () => {
    expect(formatDate("2026-09-21T10:00:00Z", "en")).toContain("21/09/2026");
    expect(formatDate("2026-09-21T10:00:00Z", "en")).toContain("13:30");
    expect(formatDate("2026-09-21T10:00:00Z", "fa")).toContain("۱۴۰۵");
    expect(formatDate("invalid", "en")).toBe("—");
  });
  it("uses authored catalogue translations with a truthful source-language fallback", () => {
    const product = {
      title: "کیف",
      description: "چرم طبیعی",
      details: { titleEn: "Bag", descriptionEn: "Leather", titleAr: "حقيبة" },
    };
    expect(catalogCopy(product, "en")).toEqual({
      title: "Bag",
      description: "Leather",
    });
    expect(catalogCopy(product, "fa").title).toBe("کیف");
    expect(catalogCopy(product, "ar")).toEqual({
      title: "حقيبة",
      description: "چرم طبیعی",
    });
  });
});
describe("card prices in Iranian rials", () => {
  it("starts at ten million tomans and uses eight increasing proposals", () => {
    expect(clubTiers).toHaveLength(8);
    expect(tierPriceRial(1)).toBe(tomanToRial(10_000_000));
    expect(
      clubTiers.every(
        (tier, i) => i === 0 || tier.priceRial > clubTiers[i - 1].priceRial,
      ),
    ).toBe(true);
    expect(tierPriceRial(0)).toBeUndefined();
    expect(tierPriceRial(8)).toBe(tomanToRial(100_000_000));
    expect(tierPriceRial(9)).toBeUndefined();
  });
  it("converts actual card credit without accepting invalid financial values", () => {
    expect(tomanToRial(2_500_000)).toBe(25_000_000);
    expect(() => tomanToRial(-1)).toThrow();
    expect(() => tomanToRial(0.5)).toThrow();
    expect(() => tomanToRial(Number.MAX_SAFE_INTEGER)).toThrow();
  });
});
