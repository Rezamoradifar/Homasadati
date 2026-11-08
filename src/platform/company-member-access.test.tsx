import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CompanyMemberAccessBanner,
  CompanyMemberAccessButton,
  CompanyMemberAccessUnavailable,
  endCompanyMemberAccess,
} from "./CompanyMemberAccess";

const state = vi.hoisted(() => ({ locale: "fa" as "fa" | "en" | "ar" }));
const request = vi.hoisted(() => vi.fn());
vi.mock("../i18n/SiteLocale", () => ({ useSiteLocale: () => ({ locale: state.locale }) }));
vi.mock("./client", async original => ({ ...await original<typeof import("./client")>(), api: request }));

const memberId = "77d04bad-b852-4b0f-bca6-796788273bfa";
const anotherMemberId = "a0dfbabe-8227-45a3-bf4e-a79499774cd1";
const access = {
  actorId: "b97ae778-d802-4e4e-aa24-809a450e4747", actorName: "Company Owner",
  targetId: memberId, targetName: "Actual Member", expiresAt: "2026-11-07T10:30:00.000Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function popupWindow() {
  return { opener: window as Window | null, closed: false, location: { href: "about:blank" }, close: vi.fn() };
}

beforeEach(() => {
  state.locale = "fa";
  request.mockReset();
  window.history.replaceState(null, "", "/admin?tab=users");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("company entry into a real member account", () => {
  it("explains the owner requirement to other administrators without offering access", () => {
    render(<CompanyMemberAccessButton userId={memberId} name="Member" canOpen={false} />);
    expect(screen.getByText(/فقط با حساب مدیر اصلی شرکت/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "باز کردن حساب عضو" })).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("opens a blank isolated tab synchronously and navigates only after the server grants access", async () => {
    const pending = deferred<unknown>();
    request.mockReturnValue(pending.promise);
    const popup = popupWindow();
    const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const store = vi.spyOn(Storage.prototype, "setItem");
    render(<CompanyMemberAccessButton userId={memberId} name="Private Member Name" />);

    fireEvent.click(screen.getByRole("button", { name: "باز کردن حساب عضو" }));
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(open.mock.invocationCallOrder[0]).toBeLessThan(request.mock.invocationCallOrder[0]);
    expect(popup.opener).toBeNull();
    expect(popup.location.href).toBe("about:blank");
    expect(request).toHaveBeenCalledWith("admin/member-access", "POST", { userId: memberId });
    expect(screen.queryByRole("link", { name: "ادامه در حساب عضو" })).toBeNull();

    await act(async () => { pending.resolve({}); await pending.promise; });
    const link = screen.getByRole("link", { name: "ادامه در حساب عضو" });
    const url = "/account?companyMember=" + encodeURIComponent(memberId);
    expect(link.getAttribute("href")).toBe(url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("href")).not.toContain("Private");
    expect(popup.location.href).toBe(url);
    expect(store).not.toHaveBeenCalled();
  });

  it("offers a visible continuation link if the browser blocks the popup", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    request.mockResolvedValue({});
    render(<CompanyMemberAccessButton userId={memberId} name="Actual Member" />);
    fireEvent.click(screen.getByRole("button", { name: "باز کردن حساب عضو" }));

    const link = await screen.findByRole("link", { name: "ادامه در حساب عضو" });
    expect(link.getAttribute("href")).toBe("/account?companyMember=" + memberId);
    expect(screen.getByText(/اگر تب تازه باز نشد/)).toBeTruthy();
  });

  it("closes the blank tab and shows the error without a ready link when access is denied", async () => {
    const popup = popupWindow();
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    request.mockRejectedValue(new Error("Company access denied"));
    render(<CompanyMemberAccessButton userId={memberId} name="Actual Member" />);
    fireEvent.click(screen.getByRole("button", { name: "باز کردن حساب عضو" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Company access denied");
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(popup.location.href).toBe("about:blank");
    expect(screen.queryByRole("link", { name: "ادامه در حساب عضو" })).toBeNull();
    expect((screen.getByRole("button", { name: "باز کردن حساب عضو" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("never opens an old member account after the selected member changes while access is starting", async () => {
    const pending = deferred<unknown>();
    request.mockReturnValue(pending.promise);
    const popup = popupWindow();
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const view = render(<CompanyMemberAccessButton userId={memberId} name="Previous Member" />);
    fireEvent.click(screen.getByRole("button", { name: "باز کردن حساب عضو" }));
    view.rerender(<CompanyMemberAccessButton userId={anotherMemberId} name="Selected Member" />);

    await act(async () => { pending.resolve({}); await pending.promise; });
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(popup.location.href).toBe("about:blank");
    expect(screen.getByText("Selected Member")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "ادامه در حساب عضو" })).toBeNull();
  });
});

describe("the persistent company-view controls", () => {
  it("names the actual member and company owner, links to the company workflow and ends only this view", async () => {
    const ending = deferred<void>();
    const exit = vi.fn().mockReturnValue(ending.promise);
    render(<CompanyMemberAccessBanner access={access} onExit={exit} />);

    expect(screen.getByRole("region", { name: "نمای شرکت در حساب عضو" })).toBeTruthy();
    expect(screen.getByText("Actual Member")).toBeTruthy();
    expect(screen.getByText("Company Owner")).toBeTruthy();
    expect(screen.getByText(/امنیت.*اطلاعات تماس و بانکی.*عملیات مالی/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "بازگشت به مدیریت شرکت" }).getAttribute("href")).toBe("/admin?tab=users");
    const button = screen.getByRole("button", { name: "پایان دسترسی به حساب عضو" });
    fireEvent.click(button);
    expect(exit).toHaveBeenCalledTimes(1);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(request).not.toHaveBeenCalled();
    await act(async () => { ending.resolve(); await ending.promise; });
  });

  it("keeps the company controls available and reports an exit failure", async () => {
    const exit = vi.fn().mockRejectedValue(new Error("Lease could not be ended"));
    render(<CompanyMemberAccessBanner access={access} onExit={exit} />);
    fireEvent.click(screen.getByRole("button", { name: "پایان دسترسی به حساب عضو" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Lease could not be ended");
    expect(screen.getByText("Actual Member")).toBeTruthy();
    expect((screen.getByRole("button", { name: "پایان دسترسی به حساب عضو" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("provides a clear unavailable state and safe return/exit controls", async () => {
    const exit = vi.fn().mockResolvedValue(undefined);
    render(<CompanyMemberAccessUnavailable message="This member lease expired" onExit={exit} />);
    expect(screen.getByRole("heading", { name: "حساب عضو در دسترس نیست" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("This member lease expired");
    expect(screen.getByRole("link", { name: "بازگشت به مدیریت شرکت" }).getAttribute("href")).toBe("/admin?tab=users");
    fireEvent.click(screen.getByRole("button", { name: "پایان دسترسی به حساب عضو" }));
    await waitFor(() => expect(exit).toHaveBeenCalledTimes(1));
  });

  it.each([
    ["en", "Company view of a member account", "End member account access", "Open member account"],
    ["ar", "عرض الشركة لحساب العضو", "إنهاء الوصول إلى حساب العضو", "فتح حساب العضو"],
  ] as const)("uses the selected %s labels while preserving account names", (locale, title, exitLabel, openLabel) => {
    state.locale = locale;
    render(<><CompanyMemberAccessBanner access={access} onExit={async () => {}} /><CompanyMemberAccessButton userId={memberId} name="Actual Member" /></>);
    expect(screen.getByRole("region", { name: title })).toBeTruthy();
    expect(screen.getByRole("button", { name: exitLabel })).toBeTruthy();
    expect(screen.getByRole("button", { name: openLabel })).toBeTruthy();
    expect(screen.getByText("Company Owner")).toBeTruthy();
  });
});

describe("ending company access without signing out the owner", () => {
  it("deletes the selected lease and removes only its URL context while retaining the owner cookie", async () => {
    request.mockResolvedValue({ ended: true });
    window.history.replaceState(null, "", "/account?companyMember=" + memberId + "&tab=orders&filter=paid#details");
    document.cookie = "test-company-owner=retained; Path=/";
    const ownerCookie = document.cookie;
    try {
      await endCompanyMemberAccess(memberId);
      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith("admin/member-access", "DELETE", { userId: memberId });
      expect(window.location.pathname).toBe("/account");
      expect(new URLSearchParams(window.location.search).get("companyMember")).toBeNull();
      expect(new URLSearchParams(window.location.search).get("tab")).toBe("orders");
      expect(new URLSearchParams(window.location.search).get("filter")).toBe("paid");
      expect(window.location.hash).toBe("#details");
      expect(document.cookie).toBe(ownerCookie);
    } finally {
      document.cookie = "test-company-owner=; Max-Age=0; Path=/";
    }
  });

  it("clears an invalid local context without issuing an owner logout or lease request", async () => {
    window.history.replaceState(null, "", "/account?companyMember=invalid&tab=profile");
    await endCompanyMemberAccess(null);
    expect(request).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?tab=profile");
  });

  it("does not falsely clear company context when ending the server lease fails", async () => {
    request.mockRejectedValue(new Error("Network unavailable"));
    window.history.replaceState(null, "", "/account?companyMember=" + memberId + "&tab=orders");
    await expect(endCompanyMemberAccess(memberId)).rejects.toThrow("Network unavailable");
    expect(new URLSearchParams(window.location.search).get("companyMember")).toBe(memberId);
    expect(request.mock.calls.map(call => call[0])).toEqual(["admin/member-access"]);
  });
});
