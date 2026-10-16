'use client';

import {useMemo, useState} from 'react';
import {ArrowLeft, ArrowRight, ChartBar, Diamond, Headset, ShieldCheck, ShoppingBag, Truck, UsersThree, Crown, Sparkle} from '@phosphor-icons/react';
import ResponsiveImage from '../src/components/media/ResponsiveImage';
import {useSiteSettings} from '../src/platform/SiteSettings';
import {useData} from '../src/platform/Widgets';
import {Money} from '../src/commerce/currency';
import AddToCart from '../src/commerce/AddToCart';
import {type RecordData} from '../src/platform/client';
import copy from './premium-home-copy.json';

type Locale = 'fa' | 'en' | 'ar';

const slides = [
  '/assets/redesign/tourism.webp',
  '/assets/redesign/heritage-hero.webp',
  '/assets/redesign/craft-feature.webp',
] as const;

function firstImage(product: RecordData): string | null {
  try {
    const images = JSON.parse(product.images || '[]');
    return Array.isArray(images) && typeof images[0] === 'string' && images[0] ? images[0] : null;
  } catch {
    return null;
  }
}

export default function PremiumHomeExact({locale}: {locale: Locale}) {
  const c = copy[locale] || copy.fa;
  const rtl = locale !== 'en';
  const Arrow = rtl ? ArrowLeft : ArrowRight;
  const {site_logo} = useSiteSettings();
  const [slide, setSlide] = useState(0);
  const catalog = useData('catalog?page=1', 0);
  const liveProducts = useMemo(() => {
    const rows = catalog.data?.rows;
    return Array.isArray(rows) ? (rows as RecordData[]).filter(p => p && p.id && p.title).slice(0, 4) : [];
  }, [catalog.data]);
  const productFallback = [
    {name:c.beauty, image:'/assets/redesign/beauty.webp',href:'/shop?vertical=beauty'},
    {name:c.craft, image:'/assets/redesign/craft-feature.webp',href:'/shop?vertical=craft'},
    {name:c.ai, image:'/assets/redesign/ai-studio.webp',href:'/shop?vertical=ai'},
    {name:c.travel, image:'/assets/redesign/tourism.webp',href:'/shop?vertical=tourism'},
  ];
  const features = [
    {title:c.quality,sub:c.qualityText,Icon:Diamond},
    {title:c.delivery,sub:c.deliveryText,Icon:Truck},
    {title:c.support,sub:c.supportText,Icon:Headset},
    {title:c.secure,sub:c.secureText,Icon:ShieldCheck},
  ];
  const ranks = ['Member','Silver','Gold','Platinum','VIP'];

  return <div className="homa-exact" dir={rtl ? 'rtl':'ltr'} id="home">
    <section className="hex-hero" aria-labelledby="hex-hero-title">
      <div className="hex-landscape" aria-hidden="true">
        <ResponsiveImage src={slides[slide]} alt="" sizes="100vw" />
      </div>
      <div className="hex-hero-light" aria-hidden="true" />
      <div className="hex-phoenix" aria-hidden="true">
        <ResponsiveImage src="/assets/premium/phoenix-gold.svg" alt="" sizes="(max-width: 720px) 30vw, 30vw"/>
      </div>
      <div className="hex-left-copy" aria-hidden="true">
        <span>{c.travel}</span><span>{c.quality}</span><span>{c.journey}</span>
      </div>
      <div className="hex-hero-body">
        <div className="hex-overline">BRIGHTER YOU <i/> BRIGHTER TOMORROW</div>
        <p className="hex-hero-name">HOMA</p>
        <h1 id="hex-hero-title">{c.title}</h1>
        <p className="hex-hero-description">{c.subtitle}</p>
        <a className="hex-gold-button" href="/shop"><Arrow size={19} aria-hidden="true"/>{c.start}</a>
      </div>
      <div className="hex-hero-product hex-hero-tourism" aria-hidden="true">
        <div className="hex-hero-halo"/>
        <div className="hex-hero-product-frame hex-hero-tourism-frame">
          <ResponsiveImage src="/assets/tourism.jpg" alt="" sizes="(max-width: 720px) 52vw, 31vw" fetchPriority="high"/>
          <span className="hex-hero-tourism-label">{c.travel}</span>
        </div>
        <div className="hex-hero-plinth"/>
      </div>
      <div className="hex-hero-aside" aria-hidden="true">PEOPLE <span>PRODUCTS</span> POSSIBILITIES</div>
      <div className="hex-hero-pagination" role="group" aria-label="HOMA slides">
        {slides.map((_,i) => <button key={i} type="button" aria-label={`Slide ${i+1}`} aria-pressed={slide===i}
          onClick={()=>setSlide(i)}/>)}
      </div>
    </section>

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
      <section className="hex-products-section" id="hex-products" aria-labelledby="hex-product-title">
        <header className="hex-section-title">
          <h2 id="hex-product-title">{c.selected}</h2>
          <a href="/shop">{c.shopCta}<Arrow size={16} aria-hidden="true"/></a>
        </header>
        <div className="hex-products-row">
          <div className="hex-product-grid" aria-busy={catalog.loading}>
            {liveProducts.length ? liveProducts.map(p=>{
              const img=firstImage(p);
              return <article className="hex-product-card" key={p.id}>
                <a className="hex-product-photo" href={`/shop/${p.id}`} aria-label={p.title}>
                  {img ? <ResponsiveImage src={img} alt={p.title} loading="lazy" sizes="(max-width:700px) 46vw, 18vw"/> :
                    <ResponsiveImage src="/assets/redesign/beauty.webp" alt="" sizes="(max-width:700px) 46vw, 18vw" loading="lazy"/>}
                  <span className="hex-product-decoration" aria-hidden="true">♡</span>
                </a>
                <h3><a href={`/shop/${p.id}`}>{p.title}</a></h3>
                <strong className="hex-price"><Money toman={p.price}/></strong>
                <div className="hex-buy"><AddToCart id={p.id} stock={p.stock}/></div>
              </article>;
            }) : productFallback.map(item=><article className="hex-product-card" key={item.href}>
              <a className="hex-product-photo" href={item.href}>
                <ResponsiveImage src={item.image} alt={item.name} loading="lazy" sizes="(max-width:700px) 46vw, 18vw" />
              </a>
              <h3><a href={item.href}>{item.name}</a></h3>
              <a className="hex-fallback-cta" href={item.href}>{c.explore} <Arrow size={14}/></a>
            </article>)}
          </div>
          <a className="hex-gift-card" href="/club">
            <div className="hex-gift-art" aria-hidden="true">
              <div className="hex-gift-shadow"/>
              <div className="hex-gift-lid"/>
              <div className="hex-gift-cube"/>
              <div className="hex-gift-ribbon-v"/>
              <div className="hex-gift-ribbon-h"/>
              <div className="hex-gift-bow bow-a"/><div className="hex-gift-bow bow-b"/>
              <Sparkle size={22} className="hex-sparkle" weight="fill"/>
            </div>
            <div className="hex-gift-copy"><small>HOMA CLUB</small><h2>{c.gift}</h2><p>{c.giftText}</p>
              <span className="hex-gold-button">{c.details}<Arrow size={16}/></span></div>
          </a>
        </div>
      </section>

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
            <small>HOMA MEMBER</small><h2 id="hex-preview-title">{c.dashboard}</h2><p>{c.dashboardText}</p>
            <a href="/account" className="hex-gold-button">{c.preview}<Arrow size={16}/></a>
          </div>
          <div className="hex-phone" aria-label={c.preview}>
            <div className="hex-phone-camera"/>
            <div className="hex-phone-head">
              <ResponsiveImage src={site_logo || '/assets/brand-mark.png'} alt="" width={39} height={39}/>
              <span>HOMA <small>MEMBER</small></span>
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
          <ResponsiveImage src="/assets/redesign/tourism.webp" alt="" sizes="(max-width:720px) 100vw, 40vw" loading="lazy"/>
          <div><small>HOMA · TOMORROW</small><h2 id="hex-story-title">{c.bright}</h2><p>{c.brightText}</p>
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
