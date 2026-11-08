'use client';

import {useState} from 'react';
import {ArrowLeft, ArrowRight, ChartBar, Diamond, Headset, ShieldCheck, ShoppingBag, Truck, UsersThree, Crown} from '@phosphor-icons/react';
import ResponsiveImage from '../src/components/media/ResponsiveImage';
import {useHeroPerformance} from '../src/components/media/useHeroPerformance';
import {useSiteSettings} from '../src/platform/SiteSettings';
import {useData} from '../src/platform/Widgets';
import PublicContent from '../src/platform/PublicContent';
import copy from './premium-home-copy.json';
import OriginalLandingHero from './OriginalLandingHero';

type Locale = 'fa' | 'en' | 'ar';

const slides = [
  '/assets/redesign/tourism.webp',
  '/assets/heritage/isfahan.webp',
  '/assets/backdrop/yazd.webp',
] as const;

export default function PremiumHomeExact({locale, heroVariant = 'original'}: {locale: Locale; heroVariant?: 'original' | 'premium'}) {
  const design = useData('homepage-design', 0);
  const values = (design.data?.values || {}) as Record<string, string>;
  const defaults = copy[locale] || copy.fa;
  const c = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, values[`${locale}.premium.${key}`] || value])) as typeof defaults;
  const rtl = locale !== 'en';
  const Arrow = rtl ? ArrowLeft : ArrowRight;
  const {site_logo} = useSiteSettings();
  const [slide, setSlide] = useState(0);
  const {heroRef,onPointerMove,onPointerLeave} = useHeroPerformance();
  const features = [
    {title:c.quality,sub:c.qualityText,Icon:Diamond},
    {title:c.delivery,sub:c.deliveryText,Icon:Truck},
    {title:c.support,sub:c.supportText,Icon:Headset},
    {title:c.secure,sub:c.secureText,Icon:ShieldCheck},
  ];
  const ranks = (['Member','Silver','Gold','Platinum','VIP'] as const).map(rank => values[`${locale}.premium.rank${rank === 'VIP' ? 'Vip' : rank}`] || rank);

  return <div className="homa-exact" dir={rtl ? 'rtl':'ltr'} id="home">
    {heroVariant === 'original' ? <OriginalLandingHero locale={locale} values={values}/> : <section ref={heroRef} className="hex-hero hex-hero-architecture" aria-labelledby="hex-hero-title"
      onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <div className="hex-landscape" aria-hidden="true">
        <ResponsiveImage src={slides[slide]} alt="" sizes="100vw" loading={slide === 0 ? "eager" : "lazy"} fetchPriority={slide === 0 ? "high" : "auto"} quality={68} />
      </div>
      <div className="hex-hero-light" aria-hidden="true" />
      <div className="hex-phoenix" aria-hidden="true">
        <ResponsiveImage src="/assets/premium/phoenix-gold.svg" alt="" sizes="(max-width: 720px) 30vw, 30vw"/>
      </div>
      <div className="hex-left-copy" aria-hidden="true">
        <span>{c.travel}</span><span>{c.quality}</span><span>{c.journey}</span>
      </div>
      <div className="hex-hero-body">
        <h1 id="hex-hero-title">{c.title}</h1>
        <p className="hex-hero-description">{c.subtitle}</p>
        <a className="hex-gold-button" href="/shop"><Arrow size={19} aria-hidden="true"/>{c.start}</a>
      </div>
      <div className="hex-hero-product hex-hero-tourism homa-heritage-3d" aria-hidden="true">
        <div className="hex-hero-halo"/>
        <div className="hex-hero-product-frame hex-hero-tourism-frame">
          <ResponsiveImage src="/assets/backdrop/persepolis.webp" alt="" sizes="(max-width: 720px) 52vw, 31vw" loading="eager" fetchPriority="auto" quality={70}/>
          <span className="homa-heritage-glass"/>
          <span className="homa-heritage-rim"/>
          <span className="homa-heritage-light"/>
          <span className="hex-hero-tourism-label">{c.travel}</span>
        </div>
        <span className="homa-heritage-shadow"/>
      </div>
      <div className="hex-hero-pagination" role="group" aria-label="HOMA slides">
        {slides.map((_,i) => <button key={i} type="button" aria-label={`Slide ${i+1}`} aria-pressed={slide===i}
          onClick={()=>setSlide(i)}/>)}
      </div>
    </section>}

    <section className="hex-portals" aria-label="HOMA">
      {[
        {href:'/shop',title:c.shop,sub:c.shopText,cta:c.shopCta,Icon:ShoppingBag},
        {href:'/club',title:c.club,sub:c.clubText,cta:c.clubCta,Icon:UsersThree},
        {href:'/income-plan',title:c.plan,sub:c.planText,cta:c.planCta,Icon:ChartBar},
      ].map(({href,title,sub,cta,Icon})=><a key={href} href={href} className="hex-portal">
        <span className="hex-portal-icon"><Icon weight="duotone" aria-hidden="true" size={59}/></span>
        <span className="hex-portal-text"><strong>{title}</strong><small>{sub}</small><span className="hex-portal-cta"><Arrow size={15} aria-hidden="true"/>{cta}</span></span>
      </a>)}
    </section>

    <div className="hex-content">
      <PublicContent />

      <div className="hex-middle">
        <div className="hex-middle-left">
          <section className="hex-benefits" aria-labelledby="hex-why-title">
            <h2 id="hex-why-title">{c.why}</h2>
            <div className="hex-benefits-grid">
              {features.map(({title,sub,Icon})=><article key={title}>
                <Icon size={42} weight="duotone" aria-hidden="true"/>
                <h3>{title}</h3><p>{sub}</p>
              </article>)}
            </div>
          </section>
          <section className="hex-ranks" aria-labelledby="hex-rank-title">
            <div className="hex-rank-top">
              <h2 id="hex-rank-title">{c.journey}</h2>
              <a href="/club/ranks">{c.rankCta}<Arrow size={16}/></a>
            </div>
            <div className="hex-rank-grid">
              {ranks.map((rank,index)=><div className={`hex-rank-item tier-${index}`} key={rank}>
                <div className="hex-rank-medal"><Crown size={22} weight="fill" aria-hidden="true"/></div>
                <strong>{rank}</strong>
              </div>)}
            </div>
          </section>
        </div>
        <section className="hex-account-preview" aria-labelledby="hex-preview-title">
          <div className="hex-account-text">
            <h2 id="hex-preview-title">{c.dashboard}</h2><p>{c.dashboardText}</p>
            <a href="/account" className="hex-gold-button">{c.preview}<Arrow size={16}/></a>
          </div>
          <div className="hex-phone" aria-label={c.preview}>
            <div className="hex-phone-camera"/>
            <div className="hex-phone-head">
              <ResponsiveImage src={site_logo || '/assets/brand-mark.png'} alt="" width={39} height={39}/>
              <span className="hex-phone-crown"><Crown size={20}/></span>
            </div>
            <div className="hex-phone-balance"><small>{c.balance}</small><strong>—</strong></div>
            <div className="hex-phone-tiles">
              {[c.orders,c.points,c.rank].map((label,i)=><span key={label}>
                <b>{i===0?'▣':i===1?'✧':'♛'}</b><small>{label}</small><strong>—</strong>
              </span>)}
            </div>
            <span className="hex-phone-action">{c.preview}</span>
          </div>
        </section>
      </div>

      <div className="hex-bottom">
        <section className="hex-story" aria-labelledby="hex-story-title">
          <ResponsiveImage src={values['image.story'] || '/assets/redesign/tourism.webp'} alt="" sizes="(max-width:720px) 100vw, 40vw" loading="lazy"/>
          <div><h2 id="hex-story-title">{c.bright}</h2><p>{c.brightText}</p>
          <a href="/about">{c.storyCta}<Arrow size={16}/></a></div>
        </section>
        <section className="hex-promises" aria-labelledby="hex-promise-title">
          <div className="hex-rank-top"><h2 id="hex-promise-title">{c.why}</h2><a href="/about">{c.storyCta}<Arrow size={15}/></a></div>
          <div className="hex-promise-grid">
            <article><div className="hex-promise-icon"><Diamond size={31}/></div><h3>{c.quality}</h3><p>{c.qualityText}</p></article>
            <article><div className="hex-promise-icon"><Headset size={31}/></div><h3>{c.support}</h3><p>{c.supportText}</p></article>
          </div>
        </section>
      </div>
    </div>
  </div>;
}
