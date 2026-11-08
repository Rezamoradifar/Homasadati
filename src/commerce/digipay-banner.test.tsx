import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DigiPayBanner from "./DigiPayBanner";
import copy from "./digipay-banner-copy.json";

const locale = vi.hoisted(() => ({ value: "fa" as "fa" | "en" | "ar" }));
vi.mock("../i18n/SiteLocale", () => ({ useSiteLocale: () => ({ locale: locale.value }) }));
afterEach(cleanup);

describe("DigiPay banner", () => {
  it.each(["fa", "en", "ar"] as const)("offers readable guidance and valid links in %s", language => {
    locale.value = language;
    render(<DigiPayBanner variant="guide" />);
    const region = screen.getByRole("complementary", { name: copy[language].cardTitle });
    expect(region.getAttribute("dir")).toBe(language === "en" ? "ltr" : "rtl");
    expect(within(region).getByText(copy[language].cardDescription)).toBeTruthy();
    expect(within(region).getByText(copy[language].condition)).toBeTruthy();
    expect(within(region).getByRole("link", { name: copy[language].guideAction }).getAttribute("href")).toBe("/shop");
    const credit = within(region).getByRole("link", { name: copy[language].creditAction });
    expect(credit.getAttribute("href")).toBe("https://www.mydigipay.com/bnpl/c-bnpl/");
    expect(credit.getAttribute("target")).toBe("_blank");
    expect(credit.getAttribute("rel")).toContain("noopener");
    expect(credit.getAttribute("rel")).toContain("noreferrer");
  });

  it("retains the original shop banner and link to the guide", () => {
    locale.value = "fa";
    render(<DigiPayBanner variant="shop" />);
    const link = screen.getByRole("link", { name: copy.fa.shop });
    expect(link.getAttribute("href")).toBe("/digipay");
    expect(link.querySelector("img")?.getAttribute("src")).toBe("/assets/digipay-installments.webp");
  });
});
