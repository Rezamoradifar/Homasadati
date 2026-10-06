"use client";

import Localized from "../src/i18n/Localized";
import ImageBrandMark from "../src/components/media/ImageBrandMark";
import ResponsiveImage from "../src/components/media/ResponsiveImage";

import { useLocale } from "next-intl";
const words = {
  fa: {
    label: "فرهنگ ایران",
    title: "قصه‌هایی از ایران",
    intro:
      "از پاسارگاد تا داستان سیمرغ؛ چند نشانه آشنا از تاریخ و فرهنگ ایران را با هم مرور کنیم.",
    more: "بیشتر درباره فرهنگ ایران",
    names: [
      "کوروش و پاسارگاد",
      "شیردال در هنر ایران",
      "سیمرغ در داستان‌های ایرانی",
    ],
    texts: [
      "نگاهی به پاسارگاد و میراث دوره هخامنشی.",
      "نقشی با پیکر شیر و بال و سر عقاب، در تصویرسازی و هنر.",
      "سیمرغ، پرنده نام‌آشنای داستان‌های ایرانی.",
    ],
    categories: ["تاریخ و سفر", "نقش و هنر", "داستان‌های ایرانی"],
    income: "طرح درآمد",
  },
  en: {
    label: "Iranian culture",
    title: "Stories from Iran",
    intro:
      "From Pasargadae to the story of Simurgh, discover familiar places and symbols from Iranian history and culture.",
    more: "More about Iranian culture",
    names: [
      "Cyrus and Pasargadae",
      "The griffin in Iranian art",
      "Simurgh in Iranian stories",
    ],
    texts: [
      "A look at Pasargadae and the heritage of the Achaemenid period.",
      "A figure with a lion’s body, wings and an eagle’s head in art and illustration.",
      "Simurgh, the familiar mythical bird of Iranian stories.",
    ],
    categories: ["History and travel", "Motifs and art", "Iranian stories"],
    income: "Income plan",
  },
  ar: {
    label: "الثقافة الإيرانية",
    title: "حكايات من إيران",
    intro:
      "من باسارغاد إلى حكاية السيمرغ، نتعرف معًا على أماكن ورموز مألوفة من تاريخ إيران وثقافتها.",
    more: "المزيد عن الثقافة الإيرانية",
    names: [
      "كورش وباسارغاد",
      "الغريفين في الفن الإيراني",
      "السيمرغ في الحكايات الإيرانية",
    ],
    texts: [
      "نظرة إلى باسارغاد وتراث العصر الأخميني.",
      "شكل بجسم أسد وأجنحة ورأس نسر في الفن والتصوير.",
      "السيمرغ، الطائر الأسطوري المعروف في الحكايات الإيرانية.",
    ],
    categories: ["التاريخ والسفر", "الزخارف والفن", "الحكايات الإيرانية"],
    income: "خطة الدخل",
  },
};
export function IncomeMenuLink() {
  const l = useLocale() as keyof typeof words;
  return (
    <Localized>
      <>
        <a className="income-menu-link" href="/income-plan">
          {words[l].income}
        </a>
        <a className="income-menu-link" href="/club/ranks">
          {l === "en"
            ? "Club ranks"
            : l === "ar"
              ? "رتب النادي"
              : "رتبه‌های باشگاه"}
        </a>
      </>
    </Localized>
  );
}
export function HeritageSections() {
  const l = useLocale() as keyof typeof words,
    c = words[l];
  return (
    <Localized>
      <section
        className="heritage-section editorial-section"
        id="heritage"
        data-editorial-version="2026-10-06"
      >
        <header>
          <p className="eyebrow">{c.label}</p>
          <h2>{c.title}</h2>
          <p>{c.intro}</p>
        </header>
        <div className="heritage-grid">
          {(
            [
              ["cyrus", 0],
              ["simurgh", 2],
            ] as const
          ).map(([key, i]) => (
            <Localized key={key}>
              <article>
                <a href={"/heritage#" + key}>
                  <div className="heritage-visual">
                    <ResponsiveImage
                      src={"/assets/heritage/" + key + "-editorial-v2.webp"}
                      alt={c.names[i]}
                      sizes="(max-width: 600px) 90vw, (max-width: 1000px) 44vw, 28vw"
                      loading="lazy"
                    />
                    <ImageBrandMark />
                  </div>
                  <div className="heritage-card-copy">
                    <small>{c.categories[i]}</small>
                    <h3>{c.names[i]}</h3>
                    <p>{c.texts[i]}</p>
                  </div>
                </a>
              </article>
            </Localized>
          ))}
        </div>
        <a className="editorial-link" href="/heritage">
          {c.more} ↗
        </a>
      </section>
    </Localized>
  );
}
