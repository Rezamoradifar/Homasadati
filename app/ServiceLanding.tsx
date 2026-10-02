"use client";

import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import ResponsiveImage from "../src/components/media/ResponsiveImage";
import Localized from "../src/i18n/Localized";
import { useSiteLocale } from "../src/i18n/SiteLocale";

const services = [
  { key: "tourism", title: "گردشگری", image: "tourism", alt: "معماری ایرانی و گنبد فیروزه‌ای در نور غروب" },
  { key: "craft", title: "صنایع‌دستی", image: "craft", alt: "ظرف میناکاری آبی بر پارچهٔ ایرانی" },
  { key: "ai", title: "هوش مصنوعی", image: "ai-studio", alt: "میز کار خلاق با تصویری از هنر ایرانی" },
  { key: "beauty", title: "زیبایی", image: "beauty", alt: "چیدمان گل رز و محصولات مراقبت از پوست" },
] as const;

export default function ServiceLanding() {
  const { locale } = useSiteLocale();
  const Arrow = locale === "en" ? ArrowRight : ArrowLeft;
  return (
    <Localized>
      <div className="discovery-opening" id="home">
        <section className="discovery-hero" aria-labelledby="discovery-title">
          <div className="discovery-hero-art" aria-hidden="true"><ResponsiveImage src="/assets/redesign/heritage-hero.webp" alt="" sizes="(max-width: 767px) 44vw, 42vw" fetchPriority="high" loading="eager" /></div>
          <div className="discovery-hero-copy">
            <h1 id="discovery-title"><span>یک باشگاه،</span><span>دنیایی از انتخاب</span></h1>
            <p>سفر، زیبایی و هنر ایرانی؛ کنار هم.</p>
          </div>
        </section>
        <section className="discovery-services" id="worlds" aria-label="خدمات هما">
          <div className="discovery-service-grid">{services.map((service, index) => <Localized key={service.key}><a className="discovery-service" href={`/worlds/${service.key}`}>
            <div className="discovery-service-image"><ResponsiveImage src={`/assets/redesign/${service.image}.webp`} alt={service.alt} sizes="(max-width: 767px) 46vw, (max-width: 1100px) 23vw, 280px" loading={index < 2 ? "eager" : "lazy"} /></div>
            <h2>{service.title}</h2>
          </a></Localized>)}</div>
          <a className="discovery-shop-button" href="/shop"><span>مشاهده فروشگاه</span><Arrow size={25} weight="light" /></a>
        </section>
        <section className="discovery-feature" aria-labelledby="discovery-feature-title">
          <div className="discovery-feature-copy"><h2 id="discovery-feature-title">اصالت، در جزئیات</h2><p>هنر دست ایرانی برای زندگی امروز.</p></div>
          <a className="discovery-feature-image" href="/worlds/craft" aria-label="کشف مجموعهٔ صنایع‌دستی"><ResponsiveImage src="/assets/redesign/craft-feature.webp" alt="چیدمان گلدان میناکاری و کیف چرمی بر دست‌بافتهٔ ایرانی" sizes="(max-width: 767px) 92vw, 1100px" loading="lazy" /></a>
          <a className="discovery-text-link" href="/worlds/craft">کشف مجموعه<Arrow size={21} weight="light" /></a>
        </section>
      </div>
    </Localized>
  );
}
