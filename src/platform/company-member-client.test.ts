import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, companyMemberTarget } from "./client";

const memberId = "77d04bad-b852-4b0f-bca6-796788273bfa";
const otherMemberId = "a0dfbabe-8227-45a3-bf4e-a79499774cd1";
const fetchRequest = vi.fn();

function lastOptions() {
  return fetchRequest.mock.calls.at(-1)![1] as RequestInit;
}

function memberHeader() {
  return new Headers(lastOptions().headers).get("x-homa-company-member");
}

beforeEach(() => {
  window.history.replaceState(null, "", "/account?companyMember=" + memberId);
  fetchRequest.mockReset();
  fetchRequest.mockImplementation(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchRequest);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("company member request context", () => {
  it.each(["me", "dashboard", "member-details", "orders/selected-order", "addresses", "network-tree?depth=2", "wallet", "seven-card-plan", "tickets"])(
    "scopes the selected member to the member endpoint %s",
    async (path) => {
      await api(path);
      expect(companyMemberTarget()).toBe(memberId);
      expect(memberHeader()).toBe(memberId);
      expect(lastOptions().credentials).toBe("same-origin");
      expect(lastOptions().cache).toBe("no-store");
      expect(new Headers(lastOptions().headers).has("Authorization")).toBe(false);
      expect(fetchRequest.mock.calls[0][0]).toBe("/api/platform/" + path);
    },
  );

  it("keeps the same owner session when saving a member's nonfinancial profile", async () => {
    const profile = {
      name: "Member Profile",
      preferences: { email: true, sms: false, inApp: true },
    };
    await api("profile", "PATCH", profile);

    expect(memberHeader()).toBe(memberId);
    expect(lastOptions().credentials).toBe("same-origin");
    expect(lastOptions().method).toBe("PATCH");
    expect(JSON.parse(String(lastOptions().body))).toEqual(profile);
    expect(new Headers(lastOptions().headers).has("Cookie")).toBe(false);
    expect(new Headers(lastOptions().headers).has("Authorization")).toBe(false);
  });

  it.each([
    "admin/users", "admin/member-access", "admin/orders/selected-order", "auth/config", "auth/login",
    "catalog", "content", "club", "merchants", "payment/methods", "payment/digipay/callback",
    "card-plan", "income-plan", "cart/quote", "referrals/check", "orders-other",
  ])("does not attach the selected member to the public or owner endpoint %s", async (path) => {
    await api(path);
    expect(memberHeader()).toBeNull();
    expect(lastOptions().credentials).toBe("same-origin");
  });

  it.each([
    "/account", "/account?companyMember=", "/account?companyMember=not-a-uuid",
    "/account?companyMember=%3Cscript%3E", "/admin?companyMember=" + memberId,
    "/shop?companyMember=" + memberId,
    "/account?companyMember=" + memberId + "&companyMember=" + otherMemberId,
  ])("does not scope requests from a missing or invalid account context: %s", async (url) => {
    window.history.replaceState(null, "", url);
    await api("me");
    expect(companyMemberTarget()).toBeNull();
    expect(memberHeader()).toBeNull();
  });

  it("blocks owner logout from company view before a request and keeps the owner cookie", async () => {
    document.cookie = "test-company-owner=retained; Path=/";
    const ownerCookie = document.cookie;
    try {
      await expect(api("auth/logout", "POST")).rejects.toMatchObject({
        code: "company_access_operation_forbidden", status: 403,
      });
      expect(fetchRequest).not.toHaveBeenCalled();
      expect(document.cookie).toBe(ownerCookie);
    } finally {
      document.cookie = "test-company-owner=; Max-Age=0; Path=/";
    }
  });

  it("reports an expired member lease separately from the owner's login session", async () => {
    const memberFailed = vi.fn();
    const ownerExpired = vi.fn();
    window.addEventListener("company-member-access-failed", memberFailed);
    window.addEventListener("platform-session-expired", ownerExpired);
    fetchRequest.mockImplementationOnce(async () => Response.json({ error: "company_access_expired" }, { status: 403 }));
    try {
      await expect(api("me")).rejects.toMatchObject({ code: "company_access_expired", status: 403 });
      expect(memberFailed).toHaveBeenCalledTimes(1);
      expect((memberFailed.mock.calls[0][0] as CustomEvent).detail).toEqual({ code: "company_access_expired" });
      expect(ownerExpired).not.toHaveBeenCalled();
      expect(lastOptions().credentials).toBe("same-origin");
    } finally {
      window.removeEventListener("company-member-access-failed", memberFailed);
      window.removeEventListener("platform-session-expired", ownerExpired);
    }
  });

  it("reads the current URL for every request and stops scoping after the company view is removed", async () => {
    await api("me");
    expect(memberHeader()).toBe(memberId);

    window.history.replaceState(null, "", "/account?companyMember=" + otherMemberId + "&tab=orders");
    await api("orders");
    expect(memberHeader()).toBe(otherMemberId);

    window.history.replaceState(null, "", "/account?tab=orders");
    await api("orders");
    expect(companyMemberTarget()).toBeNull();
    expect(memberHeader()).toBeNull();
  });

  it.each(["orders/../admin/users", "orders/../auth/config", "orders/../catalog", "orders/%2e%2e/admin/users", "orders%2f..%2fadmin/users", "https://example.test/me"])(
    "does not leak context through a path that leaves the member endpoint: %s",
    async (path) => {
      try {
        await api(path);
        expect(memberHeader()).toBeNull();
      } catch {
        expect(fetchRequest).not.toHaveBeenCalled();
      }
    },
  );
});
