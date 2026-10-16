import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PremiumMemberDashboard from "./PremiumMemberDashboard";
import { rialAmount } from "./client";

vi.mock("./SiteSettings", () => ({
  useSiteSettings: () => ({ site_logo: "/assets/brand-mark.png" }),
}));

afterEach(cleanup);

const example = {
  user: { name: "عضو نمونه", referral_code: "HOMA-TEST-1" },
  data: {
    wallet: { available: 12345, pending: 120 },
    activity: { activeOrders: 2, unreadNotifications: 1 },
    club: { desks: 3 },
    rank: { current: { name: "Silver" }, next: { name: "Gold" }, progress: 0.42 },
    invitation: { code: "HOMA-TEST-1" },
  },
};

describe("premium member dashboard", () => {
  it("shows only live API-provided money, rank and account counts", () => {
    render(<PremiumMemberDashboard {...example} onNavigate={vi.fn()} />);
    expect(screen.getByText(rialAmount(12345))).toBeTruthy();
    expect(screen.getByText("Silver")).toBeTruthy();
    expect(screen.getByText("HOMA-TEST-1")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("42");
    expect(document.querySelector('img[src="/assets/brand-mark.png"]')).toBeTruthy();
  });

  it("uses existing panel navigation callbacks, without placing orders or moving funds", () => {
    const navigate = vi.fn();
    render(<PremiumMemberDashboard {...example} onNavigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "کیف پول و برداشت" }));
    fireEvent.click(screen.getByRole("button", { name: "سفارش‌های من" }));
    fireEvent.click(screen.getByRole("button", { name: "شبکه و دعوت" }));
    expect(navigate.mock.calls.map(([tab]) => tab)).toEqual(["wallet", "orders", "network"]);
  });

  it("never fabricates unknown balances, order counts or rank", () => {
    render(<PremiumMemberDashboard user={{ name: "کاربر" }} data={{}} onNavigate={vi.fn()} />);
    expect(screen.getByText("هنوز رتبه‌ای کسب نشده")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
