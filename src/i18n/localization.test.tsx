import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { localizeNode } from "./Localized";
import { translateText, isLocale, direction } from "./core";
import en from "./en.json";
import ar from "./ar.json";
import { catalogCopy } from "./catalog";
import { clubTiers, tomanToRial, tierPriceRial } from "../commerce/club-tiers";

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
    expect(translateText("فروشگاه هما چرم", "en", en)).toBe(
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
  it("has matching complete dictionaries with intact template placeholders", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ar).sort());
    for (const [key, value] of Object.entries(en)) {
      const placeholders = (s: string) => (s.match(/\{\d+\}/g) || []).sort();
      expect(value.trim(), key).not.toBe("");
      expect(placeholders(value), key).toEqual(placeholders(key));
      expect(placeholders(ar[key as keyof typeof ar]), key).toEqual(
        placeholders(key),
      );
    }
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
  it("starts at ten million tomans and uses seven increasing proposals", () => {
    expect(clubTiers).toHaveLength(7);
    expect(tierPriceRial(1)).toBe(tomanToRial(10_000_000));
    expect(
      clubTiers.every(
        (tier, i) => i === 0 || tier.priceRial > clubTiers[i - 1].priceRial,
      ),
    ).toBe(true);
    expect(tierPriceRial(0)).toBeUndefined();
    expect(tierPriceRial(8)).toBeUndefined();
  });
  it("converts actual card credit without accepting invalid financial values", () => {
    expect(tomanToRial(2_500_000)).toBe(25_000_000);
    expect(() => tomanToRial(-1)).toThrow();
    expect(() => tomanToRial(0.5)).toThrow();
    expect(() => tomanToRial(Number.MAX_SAFE_INTEGER)).toThrow();
  });
});
