"use client";

import { useSiteSettings } from "../platform/SiteSettings";

/** Uses the very same configured logo as the global header; no asset is replaced. */
export default function FooterBrandLogo() {
  const site = useSiteSettings();
  return (
    <img
      className="footer-brand-mark"
      src={site.site_logo || "/assets/brand-mark.png"}
      alt=""
      width={64}
      height={64}
      loading="lazy"
      decoding="async"
    />
  );
}
