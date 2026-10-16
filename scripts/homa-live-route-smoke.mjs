/**
 * Read-only public route smoke audit.
 *
 * Usage after deployment:
 *   node scripts/homa-live-route-smoke.mjs https://homanets.com
 *
 * Checks only GET/HTML. Never signs in, submits data, creates payments,
 * sends OTP, or reads personal account contents.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLIC_ROUTES = Object.freeze([
  "/",
  "/about",
  "/account",
  "/admin",
  "/admin/legacy",
  "/cart",
  "/club",
  "/club/ranks",
  "/contact",
  "/help",
  "/heritage",
  "/income-plan",
  "/income-plan/presentation",
  "/legal/terms",
  "/legal/privacy",
  "/member-kit",
  "/merchants",
  "/payment/result",
  "/register",
  "/shop",
  "/support",
  "/unsubscribe",
  "/worlds/tourism",
  "/worlds/craft",
  "/worlds/beauty",
  "/worlds/ai",
  "/worlds/leather",
]);

function optionalDynamicRoutes() {
  const product = process.env.HOMA_PUBLIC_PRODUCT_ID;
  const slug = process.env.HOMA_PUBLIC_CONTENT_SLUG;
  return [
    ...(product ? [{ route: "/shop/[id]", path: "/shop/" + encodeURIComponent(product) }] : []),
    ...(slug ? [{ route: "/pages/[slug]", path: "/pages/" + encodeURIComponent(slug) }] : []),
  ];
}

export async function auditPage(url, route, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      headers: {
        Accept: "text/html",
        "User-Agent": "Homa-Public-Route-Smoke/1.0",
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const html = contentType.includes("text/html")
      ? await response.text()
      : "";
    const passed = response.ok && contentType.includes("text/html") &&
      /<html[\s>]/i.test(html) && /<body[\s>]/i.test(html);
    return {
      route,
      status: response.status,
      result: passed ? "PASS" : "FAIL",
      reason: passed ? "" : !response.ok ? "http_status" :
        !contentType.includes("text/html") ? "not_html" : "invalid_document",
    };
  } catch (e) {
    return {
      route,
      status: 0,
      result: "FAIL",
      reason: e instanceof Error ? e.name : "network_error",
    };
  }
}

export async function runSmoke(origin, fetchImpl = fetch) {
  const base = new URL(origin);
  if (!["https:", "http:"].includes(base.protocol)) throw Error("HTTP(S) origin required");
  const list = [
    ...PUBLIC_ROUTES.map(path => ({ route: path, path })),
    ...optionalDynamicRoutes(),
  ];
  const output = new Array(list.length);
  // Four at once to avoid flooding the production application.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, list.length) }, async () => {
    while (next < list.length) {
      const i = next++;
      output[i] = await auditPage(new URL(list[i].path, base), list[i].route, fetchImpl);
    }
  }));
  return output;
}

async function cli() {
  const origin = process.argv[2] || process.env.HOMA_SITE_URL || "https://homanets.com";
  const results = await runSmoke(origin);
  for (const item of results)
    console.log(item.result, item.status || "---", item.route, item.reason);
  console.log("\nChecked:", results.length,
    "Passed:", results.filter(r => r.result === "PASS").length,
    "Failed:", results.filter(r => r.result === "FAIL").length);
  if (!process.env.HOMA_PUBLIC_PRODUCT_ID || !process.env.HOMA_PUBLIC_CONTENT_SLUG) {
    console.log("Dynamic product/article instances are checked only when their public IDs are supplied.");
  }
  if (results.some(r => r.result === "FAIL")) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await cli();
}
