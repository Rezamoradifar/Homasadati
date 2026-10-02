import type { MetadataRoute } from "next";
import { siteOrigin } from "../src/platform/seo";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/api/", "/cart", "/unsubscribe", "/register"] }],
    sitemap: origin + "/sitemap.xml",
  };
}
