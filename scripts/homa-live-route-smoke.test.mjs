import { afterEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_ROUTES, auditPage, runSmoke } from "./homa-live-route-smoke.mjs";

const product = process.env.HOMA_PUBLIC_PRODUCT_ID;
const slug = process.env.HOMA_PUBLIC_CONTENT_SLUG;

afterEach(() => {
  if (product === undefined) delete process.env.HOMA_PUBLIC_PRODUCT_ID;
  else process.env.HOMA_PUBLIC_PRODUCT_ID = product;
  if (slug === undefined) delete process.env.HOMA_PUBLIC_CONTENT_SLUG;
  else process.env.HOMA_PUBLIC_CONTENT_SLUG = slug;
});

const html = '<!DOCTYPE html><html lang="fa"><head></head><body><main>HOMA</main></body></html>';
const ok = () => new Response(html, {
  status: 200,
  headers: { "content-type": "text/html; charset=utf-8" },
});

describe("read-only route smoke audit", () => {
  it("covers the public homepage, shop, help, admin login, club, and dynamic route examples", () => {
    expect(PUBLIC_ROUTES.length).toBeGreaterThanOrEqual(26);
    for (const route of ["/", "/shop", "/cart", "/account", "/admin",
      "/admin/legacy", "/register", "/unsubscribe", "/income-plan/presentation",
      "/worlds/craft", "/legal/privacy", "/help", "/support", "/payment/result"]) {
      expect(PUBLIC_ROUTES).toContain(route);
    }
  });

  it("recognizes valid HTML responses and fails safely on non-200 and JSON", async () => {
    const url = new URL("https://homanets.com/shop");
    expect((await auditPage(url, "/shop", async () => ok())).result).toBe("PASS");
    const missing = await auditPage(url, "/shop", async () => new Response("Not Found", { status: 404 }));
    expect(missing.result).toBe("FAIL");
    expect(missing.reason).toBe("http_status");
    const json = await auditPage(url, "/shop", async () =>
      new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } }));
    expect(json.reason).toBe("not_html");
  });

  it("performs only GET requests and returns sanitized route names rather than user data", async () => {
    delete process.env.HOMA_PUBLIC_PRODUCT_ID;
    delete process.env.HOMA_PUBLIC_CONTENT_SLUG;
    const fetcher = vi.fn(async (_url, init) => {
      expect(init.method).toBe("GET");
      return ok();
    });
    const results = await runSmoke("https://homanets.com", fetcher);
    expect(results).toHaveLength(PUBLIC_ROUTES.length);
    expect(results.every(r => r.result === "PASS")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(PUBLIC_ROUTES.length);
    expect(results[0]).toEqual({
      route: "/", status: 200, result: "PASS", reason: "",
    });
  });

  it("includes a real public ID only when the operator explicitly supplied one", async () => {
    process.env.HOMA_PUBLIC_PRODUCT_ID = "sample-product";
    process.env.HOMA_PUBLIC_CONTENT_SLUG = "published-story";
    const urls = [];
    const fetcher = async (url) => {
      urls.push(String(url));
      return ok();
    };
    const results = await runSmoke("https://homanets.com", fetcher);
    expect(results.some(r => r.route === "/shop/[id]")).toBe(true);
    expect(results.some(r => r.route === "/pages/[slug]")).toBe(true);
    expect(urls).toContain("https://homanets.com/shop/sample-product");
    expect(urls).toContain("https://homanets.com/pages/published-story");
  });
});
