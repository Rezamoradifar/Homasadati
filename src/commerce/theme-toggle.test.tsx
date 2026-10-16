import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import ThemeToggle from "./ThemeToggle";

vi.mock("../i18n/SiteLocale", () => ({
  useSiteLocale: () => ({ locale: "fa" }),
}));

beforeEach(() => {
  localStorage.removeItem("homa-theme");
  document.documentElement.dataset.theme = "light";
});

afterEach(() => {
  cleanup();
  localStorage.removeItem("homa-theme");
  document.documentElement.dataset.theme = "light";
});

describe("shared HOMA day and night mode", () => {
  it("switches light to dark and back, saving the preference", () => {
    render(<ThemeToggle />);
    const night = screen.getByRole("button", { name: "تغییر به حالت شب" });
    expect(night.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(night);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("homa-theme")).toBe("dark");
    const day = screen.getByRole("button", { name: "تغییر به حالت روز" });
    expect(day.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(day);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("homa-theme")).toBe("light");
  });

  it("synchronizes all mounted theme toggles", () => {
    render(<><ThemeToggle /><ThemeToggle /></>);
    const toggles = screen.getAllByRole("button", { name: "تغییر به حالت شب" });
    expect(toggles).toHaveLength(2);
    fireEvent.click(toggles[0]);
    expect(screen.getAllByRole("button", { name: "تغییر به حالت روز" })).toHaveLength(2);
  });

  it("reflects a theme selection made in another browser tab", () => {
    render(<ThemeToggle />);
    localStorage.setItem("homa-theme", "dark");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "homa-theme", newValue: "dark" })));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: "تغییر به حالت روز" })).toBeTruthy();
  });
});
