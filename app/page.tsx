import HomeLanding from "./HomeLanding";
import { completionCopy } from "./completion-copy";
import { siteLocale } from "../src/i18n/server";
import { faqJsonLd, JsonLd } from "../src/platform/seo";

export default async function Page() {
  const locale = await siteLocale();
  const c = completionCopy[locale] as Record<string, string>;
  return (
    <>
      <JsonLd data={faqJsonLd([1, 2, 3, 4].map((i) => ({ q: c[`q${i}`], a: c[`a${i}`] })))} />
      <HomeLanding />
    </>
  );
}
