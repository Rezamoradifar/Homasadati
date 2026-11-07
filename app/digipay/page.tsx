import type { Metadata } from "next";
import { CommerceShell } from "../../src/commerce/Shell";
import DigiPayGuide from "../../src/commerce/DigiPayGuide";
import guideCopy from "../../src/commerce/digipay-guide-copy.json";
import { siteLocale } from "../../src/i18n/server";
import "./digipay-guide.css";

export async function generateMetadata(): Promise<Metadata> {
  const copy = guideCopy[await siteLocale()].metadata;
  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: "/digipay" },
    openGraph: { title: copy.title, description: copy.description, url: "/digipay", type: "website" },
  };
}

export default function DigiPayGuidePage() {
  return <CommerceShell><DigiPayGuide /></CommerceShell>;
}
