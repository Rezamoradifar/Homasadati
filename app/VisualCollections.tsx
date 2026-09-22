"use client";

import Localized from "../src/i18n/Localized";
import ResponsiveImage from "../src/components/media/ResponsiveImage";

import { useEffect, useRef, useState } from "react";
import { useAutoGallery } from "../src/commerce/useAutoGallery";
import { useLocale } from "next-intl";
export const heritageSlides = [
  ["persepolis", "تخت‌جمشید", "Persepolis"],
  ["griffin", "شیردال", "Griffin"],
  ["darius", "داریوش", "Darius"],
  ["pasargadae", "آرامگاه کوروش، پاسارگاد", "Tomb of Cyrus, Pasargadae"],
  ["apadana", "آپادانا", "Apadana"],
  ["isfahan", "اصفهان", "Isfahan"],
  ["yazd", "یزد", "Yazd"],
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
    const next = (n + heritageSlides.length) % heritageSlides.length;
    setIndex(next);
  }
  useEffect(() => {
    const rail = strip.current;
    const active = rail?.children[index];
    if (!rail || !active) return;
    const item = active.getBoundingClientRect(),
      frame = rail.getBoundingClientRect();
    rail.scrollBy({
      left: item.left - frame.left - (frame.width - item.width) / 2,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [index]);

  return (
    <Localized><>
      <ResponsiveImage
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
          fa ? "روایت‌هایی از تمدن ایران" : "Stories of Iranian civilisation"
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
            {String(index + 1).padStart(2, "0")} /{" "}
            {String(heritageSlides.length).padStart(2, "0")} ·{" "}
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
            <Localized key={s[0]}><button
              onClick={() => choose(i)}
              aria-label={s[fa ? 1 : 2]}
              aria-pressed={index === i}
            >
              <ResponsiveImage
                src={"/assets/heritage/" + s[0] + ".webp"}
                sizes="(max-width: 700px) 58px, 74px"
                alt=""
                loading="lazy"
              />
            </button></Localized>
          ))}
        </div>
      </div>
    </></Localized>
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
  const [slide, setSlide] = useState(0);
  function nearestSlide() {
    const r = rail.current;
    if (!r) return 0;
    const edge = r.getBoundingClientRect().right;
    return Array.from(r.children).reduce(
      (best, child, i, children) =>
        Math.abs(child.getBoundingClientRect().right - edge) <
        Math.abs(children[best].getBoundingClientRect().right - edge)
          ? i
          : best,
      0,
    );
  }
  function move(step: number) {
    const r = rail.current;
    if (!r || r.children.length < 2) return;
    const gap = parseFloat(getComputedStyle(r).columnGap) || 0;
    const width = r.children[0].getBoundingClientRect().width;
    const visible = Math.max(
      1,
      Math.round((r.clientWidth + gap) / (width + gap)),
    );
    const positions = Math.max(1, r.children.length - visible + 1);
    const next = (nearestSlide() + step + positions) % positions;
    const item = r.children[next].getBoundingClientRect();
    r.scrollTo({
      left: r.scrollLeft + item.right - r.getBoundingClientRect().right,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }
  const auto = useAutoGallery(rail, () => move(1), 5500);
  if (!(sector in collections)) return null;
  const items = collections[sector as keyof typeof collections];
  return (
    <Localized><section className={"collection-section collection-" + sector} dir="rtl">
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
          onClick={() => {
            auto.pause();
            move(-1);
          }}
        >
          →
        </button>
        <button
          aria-label="تصاویر بعدی"
          onClick={() => {
            auto.pause();
            move(1);
          }}
        >
          ←
        </button>
        <span
          className="collection-position"
          aria-live={auto.paused ? "polite" : "off"}
        >
          {new Intl.NumberFormat("fa").format(slide + 1)} /{" "}
          {new Intl.NumberFormat("fa").format(items.length)}
        </span>
      </div>
      <div
        className="collection-rail"
        ref={rail}
        tabIndex={0}
        role="region"
        aria-label="گالری محصولات هما؛ برای تصاویر بیشتر ورق بزنید"
        onScroll={() => setSlide(nearestSlide())}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            auto.pause();
            move(event.key === "ArrowLeft" ? 1 : -1);
          }
        }}
        onPointerDown={auto.pause}
        onFocus={auto.pause}
      >
        {items.map(([id, title]) => (
          <Localized key={id}><figure>
            <ResponsiveImage
              src={"/assets/collections/" + id + ".webp"}
              sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1500px) 44vw, 640px"
              alt={title + "؛ تصویر مفهومی برند"}
              loading="lazy"
            />
            <figcaption>{title}</figcaption>
          </figure></Localized>
        ))}
      </div>
      <small>
        تصاویر مفهومی هویت برند؛ موجودی، منشأ و ضمانت واقعی هر کالا در فروشگاه
        درج می‌شود.
      </small>
      <a className="commerce-button gold" href={"/shop?vertical=" + sector}>
        مشاهده محصولات و مشخصات
      </a>
    </section></Localized>
  );
}
