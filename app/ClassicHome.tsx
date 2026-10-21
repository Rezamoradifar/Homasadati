"use client";

/** Restored September 2026 editorial landing. This is presentation-only:
 * account, payments, catalogue and referral logic stay in their modern routes. */
import {ArrowLeft, ArrowRight, AirplaneTilt, Cpu, Diamond, FlowerLotus, Gift, GlobeHemisphereWest, UsersThree} from "@phosphor-icons/react";
import {useTranslations} from "next-intl";
import ResponsiveImage from "../src/components/media/ResponsiveImage";
import Localized from "../src/i18n/Localized";
import PublicContent from "../src/platform/PublicContent";
import CatalogHighlights from "./CatalogHighlights";
import ClubPreview from "./ClubPreview";
import {CivilizationHero, BrandCollection} from "./VisualCollections";
import {HeritageSections} from "./HeritageSections";
import {BrandIntroduction, TravelCollection, CraftSection, BeautySection, CreativeStudio, Journal, BusinessPartnership, EnquiryProcess} from "./BusinessSections";
import {copy, type Locale} from "./landing-copy";

export const classicGalleryImages = [
  "heritage/persepolis.webp",
  "heritage/cyrus.webp",
  "heritage/griffin.webp",
  "heritage/simurgh.webp",
  "redesign/ai-studio.webp",
  "craft-wide.jpg",
  "international.jpg",
];

type Props = {
  locale: Locale;
  c: typeof copy.en;
  onStory: () => void;
  onEnquire: (topic: string) => void;
  onCategory: (index: number) => void;
  onArticle: (index: number) => void;
  onGallery: (index: number) => void;
};

export default function ClassicHome({locale,c,onStory,onEnquire,onCategory,onArticle,onGallery}:Props){
  const e = useTranslations("Editorial");
  const f = useTranslations("Completion");
  const t = useTranslations("Runtime");
  const Arrow = locale === "en" ? ArrowRight : ArrowLeft;
  const values = [GlobeHemisphereWest,FlowerLotus,Diamond,Cpu];
  const cards = [
    {title:c.titles[0],description:c.descriptions[0],image:"/assets/heritage/isfahan.webp",url:"/worlds/tourism"},
    {title:c.titles[1],description:c.descriptions[1],image:"/assets/collections/beauty-care.webp",url:"/worlds/beauty"},
    {title:c.titles[2],description:c.descriptions[2],image:"/assets/craft.jpg",url:"/worlds/craft"},
    {title:locale==="en"?"Homa Leather":locale==="ar"?"جلود هما":"همای چرم",
      description:locale==="en"?"Leather craft for everyday life.":locale==="ar"?"حقائب وجلود بتصميم إيراني.":"کیف، کمربند و اکسسوری چرمی با طراحی ایرانی.",
      image:"/assets/collections/leather-bag.webp",url:"/worlds/leather"},
    {title:c.titles[3],description:c.descriptions[3],image:"/assets/redesign/ai-studio.webp",url:"/worlds/ai"},
  ];
  return <Localized>
    <div className="homa-classic" dir={locale==="en"?"ltr":"rtl"} data-landing-version="classic-2026-09">
      <section className="hero classic-hero" id="home" aria-labelledby="hero-title">
        <CivilizationHero/>
        <div className="hero-shade" aria-hidden="true"/>
        <div className="hero-content">
          <p className="eyebrow">{c.eyebrow}</p>
          <h1 id="hero-title">{c.hero}</h1>
          <p className="hero-sub">{c.sub}</p>
          <p className="hero-fa">{c.line}</p>
          <div className="hero-buttons">
            <a href="#worlds" className="gold-button">{c.explore}<Arrow size={20}/></a>
            <button type="button" className="outline-button" onClick={onStory}>{c.story}<Arrow size={20}/></button>
          </div>
        </div>
        <p className="hero-quote">{c.quote}</p>
      </section>

      <div className="values-strip" aria-label={c.worlds}>
        {c.values.map((v,i)=>{const Icon=values[i];return <div key={i}><Icon weight="thin" aria-hidden="true"/><span>{v}</span></div>;})}
      </div>
      <nav className="classic-quick-links" aria-label={locale==="en"?"Explore Homanet":"دسترسی سریع"}>
        <a href="/shop">{locale==="en"?"Store":locale==="ar"?"المتجر":"فروشگاه"}</a>
        <a href="/account">{locale==="en"?"Member account":locale==="ar"?"حساب العضو":"پنل کاربران"}</a>
        <a href="/club/ranks">{c.club}</a>
        <a href="/income-plan">{locale==="en"?"Income plan":locale==="ar"?"خطة الدخل":"طرح درآمد"}</a>
        <a href="/worlds/tourism">{c.titles[0]}</a>
      </nav>

      <PublicContent/>
      <BrandIntroduction onStory={onStory}/>
      <section className="worlds content-section" id="worlds" aria-labelledby="worlds-title">
        <div className="section-heading">
          <div><p className="eyebrow">{e("collection")}</p><h2 id="worlds-title">{c.worlds}</h2></div>
          <p>{c.worldsSub}</p>
        </div>
        <div id="hex-products" className="classic-scroll-anchor"/>
        <div className="world-grid">
          {cards.map((item,i)=><a className="world-card" key={item.url} href={item.url}>
            <ResponsiveImage src={item.image} alt={item.title} sizes="(max-width:700px) 48vw, (max-width:1200px) 33vw, 22vw" loading="lazy" quality={68}/>
            <span className="card-shade" aria-hidden="true"/>
            <div className="world-copy">
              <span className="world-number">{String(i+1).padStart(2,"0")}</span>
              <h3>{item.title}</h3><p>{item.description}</p><span className="round-arrow"><Arrow size={20}/></span>
            </div>
          </a>)}
        </div>
        <div className="classic-shop-cta">
          <a className="gold-button" href="/shop">{locale==="en"?"Shop all products":locale==="ar"?"تسوق المنتجات":"مشاهده محصولات فروشگاه"}<Arrow size={18}/></a>
        </div>
      </section>

      <CatalogHighlights/>
      <HeritageSections/>
      <TravelCollection onEnquire={onEnquire}/>
      <CraftSection onEnquire={onEnquire}/>
      <BrandCollection sector="leather"/>
      <BeautySection onCategory={onCategory}/>
      <CreativeStudio onEnquire={onEnquire}/>

      <section className="gallery-section" aria-labelledby="gallery-title">
        <div className="gallery-heading"><h2 id="gallery-title">{c.gallery}</h2><p>{c.gallerySub}</p>
          <button type="button" onClick={()=>onGallery(0)}>{c.viewGallery}<Arrow size={18}/></button>
        </div>
        <div className="gallery-strip">
          {classicGalleryImages.map((image,i)=><button type="button" key={image} onClick={()=>onGallery(i)} aria-label={c.picture+" "+(i+1)}>
            <ResponsiveImage src={"/assets/"+image} alt={c.gallery+" — "+(i+1)} sizes="(max-width:700px) 160px, 15vw" loading="lazy" quality={66}/>
          </button>)}
        </div>
      </section>

      <section className="club-banner" id="club" aria-labelledby="classic-club-title">
        <ResponsiveImage className="club-photo" src="/assets/heritage/simurgh.webp" alt="" sizes="(max-width:767px) 100vw, 32vw" loading="lazy" quality={68}/>
        <div className="club-heading"><h2 id="classic-club-title">{c.club}</h2><p className="club-description">{c.clubSub}</p></div>
        <div className="club-right">
          <div className="club-perks">{c.perks.map((p,i)=>{const Icon=[Gift,Diamond,UsersThree][i];return <div key={i}><Icon size={26} weight="thin"/><p>{p}</p></div>;})}</div>
          <a className="gold-button" href="/account">{c.join}<Arrow size={19}/></a>
        </div>
      </section>
      <ClubPreview/>
      <section className="international-section content-section" id="international">
        <div><p className="eyebrow">DALARIT</p><h2>{c.international}</h2><p>{c.internationalSub}</p>
          <button type="button" className="text-button" onClick={()=>onEnquire("Dalarit")}>{c.learn}<Arrow size={20}/></button>
        </div>
        <button type="button" className="international-photo" onClick={()=>onEnquire("Dalarit")} aria-label={c.learn}>
          <ResponsiveImage src="/assets/international.jpg" sizes="(max-width:767px) 90vw, 44vw" alt={c.international} loading="lazy" quality={68}/>
          <span><AirplaneTilt size={26}/>{c.international}</span>
        </button>
      </section>
      <Journal onArticle={onArticle}/>
      <BusinessPartnership onEnquire={onEnquire}/>
      <EnquiryProcess/>
      <section className="landing-faq content-section" aria-labelledby="faq-title">
        <div><p className="eyebrow">{locale==="en"?"SUPPORT":"راهنما"}</p><h2 id="faq-title">{f("faqTitle")}</h2><p>{f("faqIntro")}</p>
          <a className="text-button" href="/support">{t("tracking")}<Arrow size={19}/></a>
        </div>
        <div className="faq-items">
          {[1,2,3,4].map(i=><details key={i}><summary>{f(`q${i}`)}</summary><p>{f(`a${i}`)}</p></details>)}
        </div>
      </section>
    </div>
  </Localized>;
}
