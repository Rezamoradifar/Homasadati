import { all } from "./schema";

/** Search-engine helpers: the canonical site origin and schema.org JSON-LD. */
export function siteOrigin() {
  const configured = process.env.APP_ORIGIN;
  try {
    if (configured) return new URL(configured).origin;
  } catch {}
  return "https://homanets.com";
}

const publicSetting = (keys: string[]) =>
  Object.fromEntries(
    all(
      `SELECT key,value FROM p_settings WHERE secret=0 AND key IN (${keys.map(() => "?").join(",")})`,
      ...keys,
    ).map((r) => [r.key, r.value]),
  ) as Record<string, string>;

export function organizationJsonLd() {
  const origin = siteOrigin();
  const s = publicSetting(["site_name", "site_logo", "site_contact", "site_email", "site_landline", "site_address", "site_postal_code"]);
  const name = s.site_name || "هما نت";
  const phone = s.site_landline || s.site_contact;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": origin + "/#organization",
      name,
      alternateName: "Homanet",
      url: origin,
      logo: origin + (s.site_logo?.startsWith("/") ? s.site_logo : "/assets/brand-mark.png"),
      ...(s.site_email ? { email: s.site_email } : {}),
      ...(phone ? { contactPoint: { "@type": "ContactPoint", telephone: phone, contactType: "customer service", availableLanguage: ["fa", "en", "ar"] } } : {}),
      ...(s.site_address
        ? { address: { "@type": "PostalAddress", streetAddress: s.site_address, addressCountry: "IR", ...(s.site_postal_code ? { postalCode: s.site_postal_code } : {}) } }
        : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": origin + "/#website",
      name,
      url: origin,
      inLanguage: "fa-IR",
      publisher: { "@id": origin + "/#organization" },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: origin + "/shop?q={search_term_string}" },
        "query-input": "required name=search_term_string",
      },
    },
  ];
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  const origin = siteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: origin + item.path })),
  };
}

/** Product with an offer. Prices are stored in toman; schema.org wants the
 * ISO currency, so the offer is given in rial (IRR). */
export function productJsonLd(p: { id: string; title: string; description: string; price: number; stock: number; images: string[]; sku?: string; brand?: string }) {
  const origin = siteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    description: p.description.slice(0, 500),
    ...(p.images.length ? { image: p.images.map((src) => (src.startsWith("http") ? src : origin + src)) } : {}),
    ...(p.sku ? { sku: p.sku } : {}),
    brand: { "@type": "Brand", name: p.brand || "هما نت" },
    offers: {
      "@type": "Offer",
      url: origin + "/shop/" + p.id,
      price: Math.round(Number(p.price) * 10),
      priceCurrency: "IRR",
      availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@id": origin + "/#organization" },
    },
  };
}

export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

/** Renders JSON-LD safely: "<" is escaped so data can never close the tag. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
