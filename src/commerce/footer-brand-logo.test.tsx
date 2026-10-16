import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import FooterBrandLogo from "./FooterBrandLogo";

const { settings } = vi.hoisted(() => ({ settings: { site_logo: "/api/platform/media/123.webp" } }));
vi.mock("../platform/SiteSettings", () => ({
  useSiteSettings: () => settings,
}));

afterEach(cleanup);

describe("shared footer identity", () => {
  it("uses the same configured logo as the header, without editing its asset", () => {
    settings.site_logo = "/media/homa-gold.webp";
    const { container } = render(<FooterBrandLogo />);
    const mark = container.querySelector("img.footer-brand-mark");
    expect(mark?.getAttribute("src")).toBe("/media/homa-gold.webp");
  });

  it("uses the existing brand-mark file when no custom logo is set", () => {
    settings.site_logo = "";
    const { container } = render(<FooterBrandLogo />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/assets/brand-mark.png");
  });
});
