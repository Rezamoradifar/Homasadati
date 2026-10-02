import type { MetadataRoute } from "next";
import { sectorKeys } from "../src/commerce/brands";
import { all } from "../src/platform/schema";
import { siteOrigin } from "../src/platform/seo";

export const dynamic = "force-dynamic";

const staticPaths: [string, number, MetadataRoute.Sitemap[number]["changeFrequency"]][] = [
  ["/", 1, "weekly"],
  ["/shop", 0.9, "daily"],
  ["/heritage", 0.7, "monthly"],
  ["/club", 0.7, "monthly"],
  ["/club/ranks", 0.6, "monthly"],
  ["/income-plan", 0.5, "monthly"],
  ["/merchants", 0.5, "monthly"],
  ["/about", 0.6, "yearly"],
  ["/contact", 0.6, "yearly"],
  ["/help", 0.5, "monthly"],
  ["/legal/terms", 0.3, "yearly"],
  ["/legal/privacy", 0.3, "yearly"],
];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  const products = all("SELECT id,updated_at FROM p_products WHERE published=1 ORDER BY updated_at DESC LIMIT 5000");
  return [
    ...staticPaths.map(([path, priority, changeFrequency]) => ({ url: origin + path, priority, changeFrequency })),
    ...sectorKeys.map((k) => ({ url: `${origin}/worlds/${k}`, priority: 0.8, changeFrequency: "weekly" as const })),
    ...products.map((p) => ({
      url: `${origin}/shop/${p.id}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
      priority: 0.7,
      changeFrequency: "weekly" as const,
    })),
  ];
}
