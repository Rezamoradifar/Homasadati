import Localized from "../../../src/i18n/Localized";
import { CommerceShell } from "../../../src/commerce/Shell";
import { notFound } from "next/navigation";
import { one } from "../../../src/platform/schema";

export const dynamic = "force-dynamic";

export default async function ContentPage({
  params: pendingParams,
}: {
  params: Promise<{ slug: string }>;
}) {
  const params = await pendingParams;
  const p = one(
    "SELECT * FROM p_content WHERE slug=? AND published=1",
    params.slug,
  );
  if (!p) notFound();
  return (
    <Localized>
      <CommerceShell>
        <main id="commerce-main" className="shop-wrap editorial-content-page" dir="rtl">
          <article className="editorial-content-card" aria-labelledby="editorial-title">
            <nav className="editorial-content-links" aria-label="دسترسی سریع">
              <a href="/">صفحه اصلی</a>
              <a href="/shop">فروشگاه</a>
            </nav>
            <header>
              <h1 id="editorial-title">{p.title}</h1>
            </header>
            {p.image && (
              <img className="editorial-content-image" src={p.image} alt="" loading="lazy" decoding="async" />
            )}
            <div className="editorial-content-body">{p.body}</div>
            <footer className="editorial-content-bottom">
              <a href="/account">ورود به حساب کاربری</a>
            </footer>
          </article>
        </main>
      </CommerceShell>
    </Localized>
  );
}
