import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Portal from "./Portal";
import companyCopy from "./company-member-copy.json";
import type { RecordData } from "./client";

const request = vi.hoisted(() => vi.fn());
const securityView = vi.hoisted(() => vi.fn(() => null));
vi.mock("./client", async (original) => ({ ...await original<typeof import("./client")>(), api: request }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("./AuthPanel", () => ({ default: () => <p>Owner sign-in form</p> }));
vi.mock("../commerce/ThemeToggle", () => ({ default: () => null }));
vi.mock("../commerce/DigiPayEntry", () => ({ default: () => null }));
vi.mock("./Widgets", () => ({
  Notice: ({ error }: { error?: string }) => error ? <p role="alert">{error}</p> : null,
  Listing: () => null,
}));
vi.mock("./UserPanel", () => ({
  Dashboard: ({ user }: { user: RecordData }) => <p>Dashboard for {user.name}</p>,
  Orders: () => <p>Member order view</p>,
  Security: securityView,
  Addresses: () => null, Catalog: () => null, Missions: () => null, Network: () => null,
  Notifications: () => null, Profile: () => null, Subscriptions: () => null, Wallet: () => null,
  commissionColumns: [],
}));

const targetId = "77d04bad-b852-4b0f-bca6-796788273bfa";
const nextId = "a0dfbabe-8227-45a3-bf4e-a79499774cd1";
const ownerId = "b4013acb-b40a-49ab-b80b-418b553ff459";
const copy = companyCopy.fa;

function member(id = targetId, name = "Target Member") {
  return { id, name, role: "user", referral_code: "member-code", companyAccess: {
    actorId: ownerId, actorName: "Company Owner", targetId: id, targetName: name,
    expiresAt: "2026-11-07T12:30:00.000Z",
  } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  request.mockReset(); securityView.mockClear();
  window.history.replaceState(null, "", "/account?companyMember=" + targetId);
});
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

describe("company view of the real member portal", () => {
  it("shows the verified member account with a persistent company banner while tabs keep the target", async () => {
    request.mockResolvedValue({ user: member() });
    render(<Portal />);
    expect(await screen.findByText("Dashboard for Target Member")).toBeTruthy();
    const banner = screen.getByRole("region", { name: copy.bannerTitle });
    expect(within(banner).getByText("Target Member")).toBeTruthy();
    expect(within(banner).getByText("Company Owner")).toBeTruthy();
    expect(within(banner).getByRole("link", { name: copy.backToCompany }).getAttribute("href")).toBe("/admin?tab=users");
    expect(screen.queryByRole("link", { name: "مدیریت" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "سفارش‌ها" }));
    expect(screen.getByText("Member order view")).toBeTruthy();
    expect(new URLSearchParams(location.search).get("companyMember")).toBe(targetId);
    expect(new URLSearchParams(location.search).get("tab")).toBe("orders");
    expect(screen.getByRole("region", { name: copy.bannerTitle })).toBeTruthy();
  });

  it("does not show the owner's account when a spoofed or unapproved company query receives an ordinary me response", async () => {
    request.mockResolvedValue({ user: { id: ownerId, name: "Private Owner Name", role: "superadmin" } });
    render(<Portal />);
    expect(await screen.findByRole("heading", { name: copy.deniedTitle })).toBeTruthy();
    expect(screen.queryByText(/Private Owner Name/)).toBeNull();
    expect(screen.queryByText(/Dashboard for/)).toBeNull();
    expect(screen.queryByText("Owner sign-in form")).toBeNull();
    expect(request).not.toHaveBeenCalledWith("auth/logout", "POST");
  });

  it("requires verified company context even when the returned user ID matches the URL", async () => {
    request.mockResolvedValue({ user: { id: targetId, name: "Unverified Member", role: "user" } });
    render(<Portal />);
    await screen.findByRole("heading", { name: copy.deniedTitle });
    expect(screen.queryByText(/Unverified Member/)).toBeNull();
    expect(screen.queryByText(/Dashboard for/)).toBeNull();
  });

  it("immediately removes a previous identity on target changes and before returning to the owner's account", async () => {
    const next = deferred<{ user: RecordData }>();
    const owner = deferred<{ user: RecordData }>();
    request.mockResolvedValueOnce({ user: member() }).mockReturnValueOnce(next.promise).mockReturnValueOnce(owner.promise);
    render(<Portal />);
    await screen.findByText("Dashboard for Target Member");

    act(() => {
      window.history.pushState(null, "", "/account?companyMember=" + nextId);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.queryByText(/Target Member/)).toBeNull();
    await act(async () => { next.resolve({ user: member(nextId, "Next Member") }); await next.promise; });
    expect(screen.getByText("Dashboard for Next Member")).toBeTruthy();

    act(() => {
      window.history.pushState(null, "", "/account");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.queryByText(/Next Member/)).toBeNull();
    await act(async () => { owner.resolve({ user: { id: ownerId, name: "Company Owner", role: "superadmin" } }); await owner.promise; });
    expect(screen.getByText("Dashboard for Company Owner")).toBeTruthy();
    expect(screen.queryByRole("region", { name: copy.bannerTitle })).toBeNull();
  });

  it("clears member data on lease expiry without rendering a target sign-in form or ending the owner session", async () => {
    request.mockResolvedValue({ user: member() });
    render(<Portal />);
    await screen.findByText("Dashboard for Target Member");
    act(() => { window.dispatchEvent(new CustomEvent("company-member-access-failed", { detail: { code: "company_access_expired" } })); });

    expect(screen.getByRole("alert").textContent).toBe(copy.expired);
    expect(screen.queryByText(/Target Member/)).toBeNull();
    expect(screen.queryByText("Owner sign-in form")).toBeNull();
    expect(request).not.toHaveBeenCalledWith("auth/logout", "POST");
  });

  it("uses lease termination for the top-level exit action while keeping the owner authenticated", async () => {
    const ending = deferred<{ ended: boolean }>();
    request.mockImplementation((path: string) => path === "me" ? Promise.resolve({ user: member() }) : ending.promise);
    document.cookie = "company-test-owner=retained; Path=/";
    const ownerCookie = document.cookie;
    try {
      render(<Portal />);
      await screen.findByText("Dashboard for Target Member");
      fireEvent.click(screen.getAllByRole("button", { name: copy.exit })[0]);
      await waitFor(() => expect(request).toHaveBeenCalledWith("admin/member-access", "DELETE", { userId: targetId }));
      expect(request).not.toHaveBeenCalledWith("auth/logout", "POST");
      expect(document.cookie).toBe(ownerCookie);
    } finally { document.cookie = "company-test-owner=; Max-Age=0; Path=/"; }
  });

  it("routes security changes to company management without mounting the member security/session editor", async () => {
    window.history.replaceState(null, "", "/account?companyMember=" + targetId + "&tab=security");
    request.mockResolvedValue({ user: member() });
    render(<Portal />);
    expect(await screen.findByText(copy.operationBlocked)).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.managementLink }).getAttribute("href")).toBe("/admin?tab=users");
    expect(securityView).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: copy.bannerTitle })).toBeTruthy();
  });
});
