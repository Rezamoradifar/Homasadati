'use client';

import ResponsiveImage from '../src/components/media/ResponsiveImage';

type Locale = 'fa' | 'en' | 'ar';

const content = {
  fa: {
    kicker: 'فراتر از یک خرید',
    title: 'هما، همراه شما در مسیر رشد',
    subtitle: 'محصولات، باشگاه مشتریان و فرصت‌های رشد در یک تجربه یکپارچه.',
    start: 'شروع کنید',
    shop: 'فروشگاه هما',
    shopText: 'محصولات منتخب با تجربه خرید ساده و مطمئن',
    shopCta: 'مشاهده محصولات',
    club: 'باشگاه هما',
    clubText: 'عضویت، امتیاز، رتبه و مزایای بیشتر',
    clubCta: 'ورود به باشگاه',
    plan: 'پلن درآمدی',
    planText: 'ساخت آینده‌ای روشن با مسیر شفاف پیشرفت',
    planCta: 'اطلاعات بیشتر',
    selected: 'منتخب هما',
    selectedSub: 'چند مسیر محبوب برای شروع تجربه هما',
    beauty: 'زیبایی و مراقبت',
    craft: 'هنر و صنایع‌دستی',
    ai: 'استودیو و فناوری',
    travel: 'تجربه و سفر',
    explore: 'مشاهده',
    gift: 'هدیه‌ای برای نسخه بهتر شما',
    giftText: 'با انتخاب محصولات و عضویت در باشگاه، تجربه‌ای فراتر از خرید بسازید.',
    details: 'جزئیات بیشتر',
    why: 'چرا هما؟',
    quality: 'کیفیت انتخاب‌شده',
    qualityText: 'محصولات و خدمات با تمرکز بر تجربه بهتر',
    delivery: 'تجربه خرید ساده',
    deliveryText: 'مسیر خرید و پیگیری شفاف و یکپارچه',
    support: 'پشتیبانی',
    supportText: 'دسترسی ساده به راهنما و پشتیبانی',
    secure: 'اعتماد و شفافیت',
    secureText: 'اطلاعات روشن و کنترل بهتر حساب',
    journey: 'مسیر پیشرفت شما',
    journeyText: 'رتبه‌ها را قدم‌به‌قدم ببینید و مسیر رشد خود را دنبال کنید.',
    rankCta: 'اطلاعات کامل رتبه‌ها',
    dashboard: 'مدیریت آسان‌تر، تجربه بهتر',
    dashboardText: 'خلاصه وضعیت حساب، سفارش‌ها، امتیازها و مسیر پیشرفت در یک داشبورد.',
    preview: 'پیش‌نمایش داشبورد',
    balance: 'خلاصه حساب',
    orders: 'سفارش‌ها',
    points: 'امتیاز',
    rank: 'رتبه',
    bright: 'به سوی آینده‌ای روشن',
    brightText: 'هما تلاش می‌کند خرید، عضویت و رشد را در یک تجربه ساده‌تر کنار هم قرار دهد.',
    storyCta: 'درباره هما',
    voices: 'صدای مشتریان ما',
    quote1: 'طراحی جدید مسیرهای اصلی سایت را خیلی واضح‌تر و سریع‌تر کرده است.',
    quote2: 'دسترسی به فروشگاه و باشگاه حالا ساده‌تر و حرفه‌ای‌تر است.'
  },
  en: {
    kicker: 'More than a purchase',
    title: 'HOMA, with you on the path to growth',
    subtitle: 'Products, membership and growth opportunities in one connected experience.',
    start: 'Get started',
    shop: 'HOMA Shop',
    shopText: 'Selected products with a simple and confident shopping experience',
    shopCta: 'View products',
    club: 'HOMA Club',
    clubText: 'Membership, points, ranks and more benefits',
    clubCta: 'Enter club',
    plan: 'Income Plan',
    planText: 'A clear path to progress and future growth',
    planCta: 'Learn more',
    selected: 'HOMA Selected',
    selectedSub: 'Popular ways to begin your HOMA experience',
    beauty: 'Beauty & Care',
    craft: 'Craft & Heritage',
    ai: 'Studio & Technology',
    travel: 'Travel & Experience',
    explore: 'Explore',
    gift: 'A gift for a better version of you',
    giftText: 'Combine products and membership for an experience beyond shopping.',
    details: 'More details',
    why: 'Why HOMA?',
    quality: 'Selected quality',
    qualityText: 'Products and services focused on a better experience',
    delivery: 'Simple shopping',
    deliveryText: 'A clear purchase and tracking journey',
    support: 'Support',
    supportText: 'Easy access to help and support',
    secure: 'Trust & clarity',
    secureText: 'Clear information and better account control',
    journey: 'Your progress journey',
    journeyText: 'See every rank and follow your growth step by step.',
    rankCta: 'View all ranks',
    dashboard: 'Easier management, better living',
    dashboardText: 'Account, orders, points and progress in one dashboard.',
    preview: 'Dashboard preview',
    balance: 'Account',
    orders: 'Orders',
    points: 'Points',
    rank: 'Rank',
    bright: 'Toward a brighter tomorrow',
    brightText: 'HOMA brings shopping, membership and progress into one simpler experience.',
    storyCta: 'About HOMA',
    voices: 'What our customers say',
    quote1: 'The new design makes the main journeys much clearer and faster.',
    quote2: 'Access to the shop and club now feels simpler and more premium.'
  },
  ar: {
    kicker: 'أكثر من مجرد شراء',
    title: 'هوما معك في طريق النمو',
    subtitle: 'المنتجات والعضوية وفرص النمو في تجربة واحدة مترابطة.',
    start: 'ابدأ الآن',
    shop: 'متجر هوما',
    shopText: 'منتجات مختارة وتجربة شراء بسيطة وواضحة',
    shopCta: 'عرض المنتجات',
    club: 'نادي هوما',
    clubText: 'عضوية ونقاط ومستويات ومزايا إضافية',
    clubCta: 'دخول النادي',
    plan: 'خطة الدخل',
    planText: 'مسار واضح للتقدم والنمو',
    planCta: 'معلومات أكثر',
    selected: 'مختارات هوما',
    selectedSub: 'مسارات شائعة لبدء تجربتك مع هوما',
    beauty: 'الجمال والعناية',
    craft: 'الحرف والتراث',
    ai: 'الاستوديو والتقنية',
    travel: 'السفر والتجارب',
    explore: 'عرض',
    gift: 'هدية لنسخة أفضل منك',
    giftText: 'اجمع بين المنتجات والعضوية لتجربة تتجاوز التسوق.',
    details: 'تفاصيل أكثر',
    why: 'لماذا هوما؟',
    quality: 'جودة مختارة',
    qualityText: 'منتجات وخدمات تركز على تجربة أفضل',
    delivery: 'تسوق أسهل',
    deliveryText: 'رحلة شراء ومتابعة واضحة',
    support: 'الدعم',
    supportText: 'وصول سهل إلى المساعدة والدعم',
    secure: 'الثقة والوضوح',
    secureText: 'معلومات واضحة وتحكم أفضل بالحساب',
    journey: 'مسار تقدمك',
    journeyText: 'تابع المستويات وتقدمك خطوة بخطوة.',
    rankCta: 'عرض كل المستويات',
    dashboard: 'إدارة أسهل وتجربة أفضل',
    dashboardText: 'الحساب والطلبات والنقاط والتقدم في لوحة واحدة.',
    preview: 'معاينة لوحة التحكم',
    balance: 'الحساب',
    orders: 'الطلبات',
    points: 'النقاط',
    rank: 'المستوى',
    bright: 'نحو مستقبل أكثر إشراقاً',
    brightText: 'تجمع هوما التسوق والعضوية والتقدم في تجربة أبسط.',
    storyCta: 'عن هوما',
    voices: 'آراء عملائنا',
    quote1: 'التصميم الجديد جعل المسارات الرئيسية أوضح وأسرع.',
    quote2: 'الوصول إلى المتجر والنادي أصبح أبسط وأكثر احترافية.'
  }
} as const;

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
