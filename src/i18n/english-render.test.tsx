import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import HomePage from "../../app/HomeLanding";
import { MemberOverview } from "../platform/MemberOverview";
import { Table } from "../platform/Widgets";
import Registration from "../platform/Registration";
import AuthPanel from "../platform/AuthPanel";
import { SiteLocaleProvider } from "./SiteLocale";
import en from "./en.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const letters = /[\u0621-\u063a\u0641-\u064a\u0671-\u06d3]/;
function englishView(children: ReactNode) {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <SiteLocaleProvider initialLocale="en" initialDictionary={en}>
      {children}
    </SiteLocaleProvider>,
  );
  return root;
}
function untranslated(root: HTMLElement) {
  const missing: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode,
      parent = node.parentElement;
    if (
      parent?.closest(
        '[translate="no"], [data-no-translate], script, style, option[value="fa"], option[value="ar"]',
      )
    )
      continue;
    if (letters.test(node.textContent || ""))
      missing.push(node.textContent!.trim());
  }
  for (const element of root.querySelectorAll("*")) {
    if (element.closest('[translate="no"], [data-no-translate]')) continue;
    for (const name of ["alt", "title", "aria-label", "placeholder"])
      if (letters.test(element.getAttribute(name) || ""))
        missing.push(`${name}: ${element.getAttribute(name)}`);
  }
  return missing;
}

describe("English pages", () => {
  it("renders the homepage and accessible image text in English", () => {
    expect(untranslated(englishView(<HomePage />))).toEqual([]);
  });
  it("renders account shortcuts without translating the member's own name", () => {
    const root = englishView(
      <MemberOverview
        user={{ name: "نام شخصی" }}
        activity={{
          activeOrders: 2,
          unreadNotifications: 1,
          openTickets: 0,
          activeSubscriptions: 3,
        }}
        onNavigate={() => {}}
      />,
    );
    expect(untranslated(root)).toEqual([]);
    expect(root.querySelector("h2")!.textContent).toBe("Welcome, نام شخصی");
    expect(
      root.querySelector('a[href="/account?tab=orders"]')!.textContent,
    ).toContain("Orders in progress");
  });
  it("renders registration, sign-in and administrator sign-in in English", () => {
    expect(
      untranslated(
        englishView(
          <>
            <Registration onLogin={() => {}} onBack={() => {}} />
            <AuthPanel onLogin={() => {}} />
            <AuthPanel admin onLogin={() => {}} />
          </>,
        ),
      ),
    ).toEqual([]);
  });
  it("renders English table dates using the Gregorian calendar", () => {
    const root = englishView(
      <Table
        rows={[{ id: "example", created_at: "2026-09-21T10:00:00Z" }]}
        columns={[["created_at", "تاریخ", "date"]]}
      />,
    );
    expect(root.textContent).toContain("21/09/2026");
    expect(untranslated(root)).toEqual([]);
  });
});
