'use client';

import ResponsiveImage from '../src/components/media/ResponsiveImage';
import content from './premium-home-copy.json';

type Locale = 'fa' | 'en' | 'ar';



export default function PremiumHomeV2({locale}:{locale:Locale}) {
  const c = content[locale] ?? content.fa;
  const rtl = locale !== 'en';
  const products = [
    {title:c.beauty, image:'/assets/redesign/beauty.webp', href:'/worlds/beauty'},
    {title:c.craft, image:'/assets/redesign/craft-feature.webp', href:'/worlds/craft'},
    {title:c.ai, image:'/assets/redesign/ai-studio.webp', href:'/worlds/ai'},
    {title:c.travel, image:'/assets/redesign/tourism.webp', href:'/worlds/tourism'}
  ];
  const benefits = [
    [c.quality,c.qualityText,'✦'],
    [c.delivery,c.deliveryText,'↗'],
    [c.support,c.supportText,'◌'],
    [c.secure,c.secureText,'◇']
  ];
  const ranks = ['Member','Silver','Gold','Platinum','VIP'];

  return <div className="homa-v2" dir={rtl?'rtl':'ltr'}>
    <section className="homa-v2-hero" id="home">
      <ResponsiveImage className="homa-v2-hero-bg" src="/assets/redesign/heritage-hero.webp" alt="" sizes="100vw"/>
      <div className="homa-v2-hero-shade"/>
      <div className="homa-v2-hero-copy">
        <div className="homa-v2-brandline"><ResponsiveImage src="/assets/brand-mark.png" alt="" width={78} height={78}/><span>HOMA</span></div>
        <p className="homa-v2-kicker">{c.kicker}</p>
        <h1>{c.title}</h1>
        <p>{c.subtitle}</p>
        <a className="homa-v2-primary" href="/shop">{c.start}<span>←</span></a>
      </div>
      <div className="homa-v2-hero-product">
        <ResponsiveImage src="/assets/redesign/beauty.webp" alt={c.beauty} sizes="(max-width: 760px) 60vw, 28vw"/>
      </div>
    </section>

    <section className="homa-v2-portals" aria-label="HOMA">
      <a href="/shop"><span className="homa-v2-icon">▣</span><div><h2>{c.shop}</h2><p>{c.shopText}</p><b>{c.shopCta} ←</b></div></a>
      <a href="/club/ranks"><span className="homa-v2-icon">♚</span><div><h2>{c.club}</h2><p>{c.clubText}</p><b>{c.clubCta} ←</b></div></a>
      <a href="/income-plan"><span className="homa-v2-icon">▥</span><div><h2>{c.plan}</h2><p>{c.planText}</p><b>{c.planCta} ←</b></div></a>
    </section>

    <section className="homa-v2-section">
      <div className="homa-v2-heading"><div><small>HOMA SELECTED</small><h2>{c.selected}</h2></div><p>{c.selectedSub}</p></div>
      <div className="homa-v2-product-layout">
        <div className="homa-v2-products">
          {products.map(item=><a className="homa-v2-product" key={item.href} href={item.href}>
            <div className="homa-v2-product-image"><ResponsiveImage src={item.image} alt={item.title} sizes="(max-width: 720px) 45vw, 20vw"/></div>
            <div><h3>{item.title}</h3><span>{c.explore} ←</span></div>
          </a>)}
        </div>
        <a className="homa-v2-gift" href="/club/ranks">
          <div className="homa-v2-gift-mark"><ResponsiveImage src="/assets/brand-mark.png" alt="" width={110} height={110}/></div>
          <div><small>HOMA CLUB</small><h3>{c.gift}</h3><p>{c.giftText}</p><span>{c.details} ←</span></div>
        </a>
      </div>
    </section>

    <section className="homa-v2-split">
      <div className="homa-v2-why">
        <div className="homa-v2-heading compact"><div><small>HOMA PROMISE</small><h2>{c.why}</h2></div></div>
        <div className="homa-v2-benefits">{benefits.map(([title,text,icon])=><article key={title}><i>{icon}</i><h3>{title}</h3><p>{text}</p></article>)}</div>
        <div className="homa-v2-ranks">
          <div className="homa-v2-rank-head"><div><h3>{c.journey}</h3><p>{c.journeyText}</p></div><a href="/club/ranks">{c.rankCta} ←</a></div>
          <div className="homa-v2-rankline">{ranks.map((rank,index)=><div key={rank}><span className={'rank-dot rank-'+index}>◆</span><b>{rank}</b></div>)}</div>
        </div>
      </div>

      <div className="homa-v2-dashboard">
        <div className="homa-v2-dashboard-copy"><small>HOMA MEMBER</small><h2>{c.dashboard}</h2><p>{c.dashboardText}</p><a href="/account">{c.preview} ←</a></div>
        <div className="homa-v2-phone">
          <div className="homa-v2-phone-top"><ResponsiveImage src="/assets/brand-mark.png" alt="" width={34} height={34}/><div><b>HOMA Member</b><span>Premium experience</span></div><em>Gold</em></div>
          <div className="homa-v2-phone-balance"><small>{c.balance}</small><strong>—</strong></div>
          <div className="homa-v2-phone-stats"><div><small>{c.orders}</small><b>—</b></div><div><small>{c.points}</small><b>—</b></div><div><small>{c.rank}</small><b>Gold</b></div></div>
          <span className="homa-v2-phone-button">{c.preview}</span>
        </div>
      </div>
    </section>

    <section className="homa-v2-story">
      <div className="homa-v2-story-image"><ResponsiveImage src="/assets/redesign/tourism.webp" alt="" sizes="(max-width: 760px) 100vw, 46vw"/></div>
      <div className="homa-v2-story-copy"><small>HOMA</small><h2>{c.bright}</h2><p>{c.brightText}</p><a href="/about">{c.storyCta} ←</a></div>
      <div className="homa-v2-voices"><h3>{c.voices}</h3><article><p>“{c.quote1}”</p><span>★★★★★</span></article><article><p>“{c.quote2}”</p><span>★★★★★</span></article></div>
    </section>
  </div>;
}
