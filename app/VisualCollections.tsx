"use client";
import { useEffect, useRef, useState } from "react";
import { useAutoGallery } from "../src/commerce/useAutoGallery";
import { useLocale } from "next-intl";
export const heritageSlides = [
  ["persepolis", "تخت‌جمشید", "Persepolis"],
  ["griffin", "شیردال", "Griffin"],
  ["simurgh", "سیمرغ", "Simurgh"],
  ["cyrus", "کوروش", "Cyrus"],
  ["darius", "داریوش", "Darius"],
  ["pasargadae", "پاسارگاد", "Pasargadae"],
  ["apadana", "آپادانا", "Apadana"],
  ["isfahan", "اصفهان", "Isfahan"],
  ["lotfollah", "نقش و نور", "Light and pattern"],
  ["shushtar", "شوشتر", "Shushtar"],
  ["bam", "ارگ بم", "Bam"],
  ["yazd", "یزد", "Yazd"],
  ["sassanid", "میراث ساسانی", "Sassanid heritage"],
  ["tabriz", "بازار تبریز", "Tabriz"],
  ["garden", "باغ ایرانی", "Persian garden"],
];
export function CivilizationHero() {
  const locale = useLocale(),
    fa = locale !== "en";
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLImageElement>(null);
  const auto = useAutoGallery(hero, () =>
    setIndex((i) => (i + 1) % heritageSlides.length),
  );
  function choose(n: number) {
    auto.pause();
    const next = (n + 15) % 15;
    setIndex(next);
  }
  useEffect(() => {
    const rail = strip.current;
    const active = rail?.children[index];
    if (!rail || !active) return;
    const item = active.getBoundingClientRect(), frame = rail.getBoundingClientRect();
    rail.scrollBy({left: item.left - frame.left - (frame.width - item.width) / 2,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  }, [index]);

  return (
    <>
      <img
        ref={hero}
        className="hero-photo"
        src={"/assets/heritage/" + heritageSlides[index][0] + ".webp"}
        alt={heritageSlides[index][fa ? 1 : 2]}
        fetchPriority="high"
      />
      <div
        className="civilization-controls"
        role="region"
        aria-label={
          fa ? "پانزده روایت از تمدن ایران" : "Fifteen visions of Iran"
        }
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            choose(index + 1);
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            choose(index - 1);
          }
        }}
      >
        <div className="civilization-caption">
          <button
            onClick={() => choose(index - 1)}
            aria-label={fa ? "تصویر قبلی" : "Previous image"}
          >
            ←
          </button>
          <span aria-live={auto.paused ? "polite" : "off"}>
            {String(index + 1).padStart(2, "0")} / 15 ·{" "}
            {heritageSlides[index][fa ? 1 : 2]}{" "}
            <small>{fa ? "بازآفرینی هنری" : "Artistic interpretation"}</small>
          </span>
          <button
            onClick={() => choose(index + 1)}
            aria-label={fa ? "تصویر بعدی" : "Next image"}
          >
            →
          </button>
        </div>
        <button
          className="gallery-play"
          type="button"
          onClick={auto.toggle}
          aria-pressed={!auto.paused}
        >
          {fa
            ? auto.paused
              ? "پخش خودکار تصاویر"
              : "توقف پخش خودکار"
            : auto.paused
              ? "Auto play"
              : "Pause slideshow"}
        </button>
        <div
          className="civilization-thumbs"
          ref={strip}
          onPointerDown={auto.pause}
          onFocus={auto.pause}
        >
          {heritageSlides.map((s, i) => (
            <button
              key={s[0]}
              onClick={() => choose(i)}
              aria-label={s[fa ? 1 : 2]}
              aria-pressed={index === i}
            >
              <img
                src={"/assets/heritage/" + s[0] + ".webp"}
                alt=""
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
const collections = {
  leather: [
    ["leather-bag", "هما چرم؛ اصالت در جزئیات"],
    ["leather-wallet", "طراحی برای همراهی هر روز"],
    ["leather-craft", "هنر دست، دقت در دوخت"],
    ["leather-belt", "کمربند چرم؛ جزئیاتی برای هر روز"],
    ["leather-women", "کیف زنانه؛ ظرافت با امضای هما"],
    ["leather-men", "کیف اداری و دوشی مردانه"],
  ],
  beauty: [
    ["beauty-cream", "هما زیبا؛ آیین مراقبت روزانه"],
    ["beauty-care", "مراقبت پوست و مو با هویت هما"],
    ["beauty-portrait", "زیبایی آرام، انتخاب آگاهانه"],
  ],
  ai: [["ai-human", "هما هوشمند؛ انسان، خلاقیت و فناوری"]],
};
export function BrandCollection({ sector }: { sector: string }) {
  const rail = useRef<HTMLDivElement>(null);
  const slide = useRef(0);
  const auto = useAutoGallery(
    rail,
    () => {
      const r = rail.current;
      if (!r || r.children.length < 2) return;
      slide.current = (slide.current + 1) % r.children.length;
      const width = r.children[0].getBoundingClientRect().width + 24;
      r.scrollTo({ left: -slide.current * width, behavior: "smooth" });
    },
    5500,
  );
  if (!(sector in collections)) return null;
  const items = collections[sector as keyof typeof collections];
  return (
    <section className={"collection-section collection-" + sector} dir="rtl">
      <p className="commerce-eyebrow">THE HOMA COLLECTION</p>
      <h2>
        {sector === "leather"
          ? "چرم اصیل ایرانی؛ امضای هما"
          : sector === "beauty"
            ? "زیبایی با امضای هما"
            : "هوش در خدمت انسان"}
      </h2>
      <p>
        {sector === "leather"
          ? "کیف، اکسسوری و مصنوعات چرمی با هویت هما؛ نوع چرم، محل تولید، شرایط ضمانت‌نامه و خدمات پس از فروش را برای هر محصول در مشخصات فروشگاه بررسی کنید."
          : sector === "beauty"
            ? "جهان مراقبت هما: کرم‌ها، مراقبت پوست و مو و محصولات بهداشتی. ترکیبات، مجوز، تولیدکننده، تاریخ مصرف و روش استفاده باید در صفحه هر محصول درج شود."
            : "ابزارهای هوشمند برای محتوای بهتر، ارتباط با مشتری و رشد فروش در تمام جهان‌های هما."}
      </p>
      <div className="collection-nav">
        <button type="button" onClick={auto.toggle} aria-pressed={!auto.paused}>
          {auto.paused ? "پخش خودکار" : "توقف اسکرول خودکار"}
        </button>
        <button
          aria-label="تصاویر قبلی"
          onClick={() => { auto.pause(); rail.current?.scrollBy({ left: 400, behavior: "smooth" }); }}
        >
          →
        </button>
        <button
          aria-label="تصاویر بعدی"
          onClick={() => { auto.pause(); rail.current?.scrollBy({ left: -400, behavior: "smooth" }); }}
        >
          ←
        </button>
      </div>
      <div
        className="collection-rail"
        ref={rail}
        onPointerDown={auto.pause}
        onFocus={auto.pause}
      >
        {items.map(([id, title]) => (
          <figure key={id}>
            <img
              src={"/assets/collections/" + id + ".webp"}
              alt={title + "؛ تصویر مفهومی برند"}
              loading="lazy"
            />
            <figcaption>{title}</figcaption>
          </figure>
        ))}
      </div>
      <small>
        تصاویر مفهومی هویت برند؛ موجودی، منشأ و ضمانت واقعی هر کالا در فروشگاه
        درج می‌شود.
      </small>
      <a className="commerce-button gold" href={"/shop?vertical=" + sector}>
        مشاهده محصولات و مشخصات
      </a>
    </section>
  );
}
