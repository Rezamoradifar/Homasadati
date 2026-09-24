
import {siteLocale, translatedMetadata} from "../../../src/i18n/server";
import {loadDictionary,translateText} from "../../../src/i18n/core";
import Localized from "../../../src/i18n/Localized";
import ResponsiveImage from "../../../src/components/media/ResponsiveImage";
import { BrandCollection } from "../../VisualCollections";
import TourismMedia from "../../TourismMedia";
import TourismHeroVideo from "../../TourismHeroVideo";
import ClubCards from "../../ClubCards";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { brands, isSector, menuLabel, menuName, menuSectors } from "../../../src/commerce/brands";
import { craftShopHref } from "../../../src/commerce/craft-taxonomy";
import { stories } from "../../../src/commerce/content";
import { CommerceShell } from "../../../src/commerce/Shell";
import Economics from "../../../src/commerce/Economics";
import { CraftCategoryGrid } from "../../../src/commerce/CraftNav";
export async function generateMetadata({
  params: pendingParams,
}: {
  params: Promise<{ sector: string }>;
}): Promise<Metadata> {
  const params = await pendingParams;
  if (!isSector(params.sector)) return {};
  const b = brands[params.sector];
  return translatedMetadata({
    title: `${b.name} | ${b.label} — هما نت`,
    description: stories[params.sector].intro,
  });
}
export default async function BrandPage({
  params: pendingParams,
}: {
  params: Promise<{ sector: string }>;
}) {
  const params = await pendingParams;
  if (!isSector(params.sector)) notFound();
  if (params.sector === "leather") redirect(craftShopHref("leather"));
  const locale=await siteLocale(),dictionary=await loadDictionary(locale);
  const t=(text:string)=>translateText(text,locale,dictionary);
  const k = params.sector,
    b = brands[k],
    s = stories[k];
  return (
    <Localized><CommerceShell>
      <main id="commerce-main">
        <section
          className={`brand-hero ${k}`}
          style={{ backgroundColor: b.tone }}
        >
          {k === "tourism" ? (
            <TourismHeroVideo />
          ) : (
            b.image && (
              <ResponsiveImage
                src={b.image}
                fetchPriority="high"
                alt="تصویر مفهومی حوزه فعالیت؛ تصویر محصول قابل خرید نیست"
              />
            )
          )}
          <div>
            <span className="commerce-eyebrow">
              {b.latin} / {b.label}
            </span>
            <h1>{b.name}</h1>
            <p>{b.tagline}</p>
            <a className="commerce-button gold" href={`/shop?vertical=${k}`}>
              مشاهده محصولات و خدمات
            </a>
            <a className="commerce-button outline" href="#story">
              شناخت حوزه و فرصت‌ها
            </a>
          </div>
          {!b.image && (
            <span className="leather-monogram" aria-hidden="true">
              H
            </span>
          )}
        </section>
        {k === "tourism" && <ClubCards />}
        <section id="story" className="brand-intro">
          <span className="commerce-eyebrow">هویت، کیفیت و ارزش اقتصادی</span>
          <h2>{b.label}؛ فراتر از یک انتخاب</h2>
          <p>{s.intro}</p>
        </section>
        {k === "tourism" && <TourismMedia />}
        {k === "craft" && <CraftCategoryGrid />}
        {k === "craft" && (
          <section className="tourism-media">
            <h2>هنر ایرانی، اعتبار سفر شما</h2>
            <p>
              با عضویت در باشگاه و خرید واجد شرایط از همای تمدن، پس از پایان مهلت
              لغو و احراز رتبه، کارت سفر به نام شما صادر می‌شود. اعتبار هر رتبه
              را مدیریت تعیین می‌کند؛ این اعتبار غیرنقدی است و درخواست استفاده
              باید حداقل هفت روز کاری کامل پیش از سفر به کارگزار برسد.
            </p>
            <a
              className="commerce-button gold"
              href="/account?tab=travel-cards"
            >
              مشاهده کارت‌های سفر من
            </a>
          </section>
        )}
        <BrandCollection sector={k} />
        <div className="story-layout">
          <aside>
            <nav aria-label="فهرست محتوای این صفحه">
              {s.chapters.map((c, i) => (
                <Localized key={c.id}><a href={`#${c.id}`}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  {t(c.title)}
                </a></Localized>
              ))}
              <a href="#economy-model">مدل درآمد و هزینه</a>
              <a href="#questions">پرسش‌های رایج</a>
            </nav>
          </aside>
          <div>
            {s.chapters.map((c, i) => (
              <Localized key={c.id}><section className="story-chapter" id={c.id}>
                <span className="chapter-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2>{t(c.title)}</h2>
                {c.paragraphs.map((p, j) => (
                  <Localized key={j}><p>{p}</p></Localized>
                ))}
                {c.points && (
                  <ul>
                    {c.points.map((p) => (
                      <Localized key={p}><li>{p}</li></Localized>
                    ))}
                  </ul>
                )}
                {c.source && (
                  <a
                    className="story-source"
                    href={c.source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("منبع:")} {t(c.source.label)} ↗
                  </a>
                )}
              </section></Localized>
            ))}
          </div>
        </div>
        <section className="economic-model" id="economy-model">
          <span className="commerce-eyebrow">چارچوب پیشنهادی کسب‌وکار</span>
          <h2>درآمد، هزینه و معیار موفقیت</h2>
          <div>
            {[
              ["مسیرهای درآمد", s.economics.income],
              ["هزینه‌هایی که باید دید", s.economics.costs],
              ["شاخص‌های قابل سنجش", s.economics.metrics],
            ].map(([title, items]) => (
              <Localized key={String(title)}><article>
                <h3>{title}</h3>
                <ul>
                  {(items as string[]).map((x) => (
                    <Localized key={x}><li>{x}</li></Localized>
                  ))}
                </ul>
              </article></Localized>
            ))}
          </div>
        </section>
        <Economics />
        <section id="questions" className="brand-faq">
          <h2>پرسش‌های رایج</h2>
          {s.faq.map(([q, a]) => (
            <Localized key={q}><details>
              <summary>{q}</summary>
              <p>{a}</p>
            </details></Localized>
          ))}
          <p className="source-date">
            آخرین بررسی محتوای مستند: ۲۰ سپتامبر ۲۰۲۶. تحلیل اقتصادی این صفحه
            چارچوب پیشنهادی هماست؛ آمار عملکرد واقعی شرکت یا تضمین سود نیست.
          </p>
        </section>
        <section className="brand-final">
          <h2>حالا با آگاهی انتخاب کنید.</h2>
          <p>قیمت، موجودی، توضیحات و شرایط هر پیشنهاد را در فروشگاه ببینید.</p>
          <a className="commerce-button gold" href={`/shop?vertical=${k}`}>
            ورود به فروشگاه {b.name}
          </a>
        </section>
        <section className="brand-related">
          <h2>دیگر جهان‌های همای</h2>
          <div>
            {menuSectors
              .filter((x) => x !== k)
              .map((x) => (
                <Localized key={x}><a href={`/worlds/${x}`}>
                  <strong>{menuName(x)}</strong>
                  <span>{menuLabel(x)} ←</span>
                </a></Localized>
              ))}
          </div>
        </section>
      </main>
    </CommerceShell></Localized>
  );
}
