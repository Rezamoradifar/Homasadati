'use client';

import ContactDetails from "../src/commerce/ContactDetails";
import Localized from "../src/i18n/Localized";
import ResponsiveImage from "../src/components/media/ResponsiveImage";

import {useSiteLocale} from '../src/i18n/SiteLocale';
import ClubPreview from './ClubPreview';
import {CivilizationHero,BrandCollection} from './VisualCollections';
import ThemeToggle from '../src/commerce/ThemeToggle';
import {HeritageSections,IncomeMenuLink} from './HeritageSections';
import './heritage.css';
import {brands,sectorKeys} from '../src/commerce/brands';
import '../src/commerce/commerce.css';
import PublicContent from '../src/platform/PublicContent';
import {useSiteSettings} from '../src/platform/SiteSettings';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {NextIntlClientProvider, useTranslations} from 'next-intl';
import {ArrowRight, ArrowLeft, Play, GlobeHemisphereWest, FlowerLotus, Cpu, Gift, Diamond, UsersThree, List, X, CaretLeft, CaretRight, Quotes} from '@phosphor-icons/react';
import {Footer, localeDirection, defaultColumns} from '../src/components/footer';
import en from '../src/messages/en.json';
import fa from '../src/messages/fa.json';
import ar from '../src/messages/ar.json';
import {copy, type Locale} from './landing-copy';
import './landing.css';
import './editorial.css';
import {editorialCopy} from './editorial-copy';
import {BrandIntroduction,TravelCollection,CraftSection,BeautySection,CreativeStudio,Journal,BusinessPartnership,EnquiryProcess} from './BusinessSections';
import {completionCopy} from './completion-copy';
import {functionalCopy} from './function-copy';
import {sectionContent} from './section-content';
const translations={en,fa,ar};
const images=['tourism.jpg','collections/beauty-portrait.webp','craft.jpg','collections/ai-human.webp'];
const galleryImages=['heritage/persepolis.webp','heritage/cyrus.webp','heritage/simurgh.webp','collections/ai-human.webp','craft-wide.jpg'];
const sections=['tourism','beauty','handicrafts','ai'];
function requestKey(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
const ValueIcons=[GlobeHemisphereWest,FlowerLotus,Diamond,Cpu];
type Modal = 'story' | 'contact' | 'club' | 'gallery' | 'info' | 'tracking' | 'journal' | number | null;

function Landing({locale,setLocale}:{locale:Locale;setLocale:(locale:Locale)=>void}) {
 const e=useTranslations('Editorial'); const [article,setArticle]=useState(1);
 const f=useTranslations('Completion'); const [copyNotice,setCopyNotice]=useState('');
 const u=useTranslations('Runtime'); const st=useTranslations('Sections'); const [infoKey,setInfoKey]=useState('help');
 const t=useTranslations('Landing'); const tf=useTranslations('Footer'); const [infoTitle,setInfoTitle]=useState('');
 const c=Object.fromEntries(Object.keys(copy.en).map(key=>[key,Array.isArray(copy.en[key as keyof typeof copy.en])?(copy.en[key as keyof typeof copy.en] as string[]).map((_,i)=>t(`${key}.${i}`)):t(key)])) as typeof copy.en;
 const [menu,setMenu]=useState(false); const [modal,setModal]=useState<Modal>(null); const [galleryIndex,setGalleryIndex]=useState(0);
 const [currency,setCurrency]=useState('USD'); const [interest,setInterest]=useState(''); const [submitted,setSubmitted]=useState(false);
 const [request,setRequest]=useState({name:'',email:'',message:''}); const dialog=useRef<HTMLDialogElement>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[code,setCode]=useState(''),[status,setStatus]=useState(''),[unsubscribe,setUnsubscribe]=useState('');
 const key=useRef(''),locked=useRef(false);
 const changeCurrency=(value:string)=>{setCurrency(value);try{localStorage.setItem('homay-currency',value);}catch{}};
 useEffect(()=>{try{const v=localStorage.getItem('homay-currency');if(v&&['USD','EUR','AED','IRR'].includes(v))setCurrency(v);}catch{}},[]);
 const subscribe=async(email:string)=>{setUnsubscribe('');const response=await fetch('/api/newsletter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,locale,consent:true})});if(!response.ok)throw new Error(u('error'));const data=await response.json();if(data.unsubscribeToken)setUnsubscribe(data.unsubscribeToken);};
 const track=async(event:FormEvent)=>{event.preventDefault();setBusy(true);setError('');setStatus('');try{const response=await fetch('/api/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});if(!response.ok)throw new Error(u(response.status===404?'notFound':response.status===429?'rate':'error'));const data=await response.json();setStatus(data.status);}catch(e){setError(e instanceof Error&&[u('notFound'),u('rate'),u('error')].includes(e.message)?e.message:u('error'));}finally{setBusy(false);}};
 const copyCode=async()=>{try{await navigator.clipboard.writeText(code);setCopyNotice(u('copied'));}catch{setCopyNotice(f('copyFailed'));}};
 const receipt=()=>{const url=URL.createObjectURL(new Blob([`${u('success')}\n${u('trackingCode')}: ${code}\n${request.name}\n${request.email}\n${interest}`],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='homay-receipt.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const rtl=locale!=='en'; const Arrow=rtl?ArrowLeft:ArrowRight;
 const siteSettings=useSiteSettings();
 const open=(value:Modal)=>{if(typeof value==='number'){window.location.assign('/worlds/'+['tourism','beauty','craft','ai'][value]);return;}if(value==='club'){window.location.assign('/account');return;}setSubmitted(false);setCopyNotice('');setError('');setStatus('');key.current='';setModal(value);setMenu(false);};
 useEffect(()=>{document.documentElement.lang=locale;document.documentElement.dir=localeDirection(locale);},[locale]);
 useEffect(()=>{if(modal!==null) {dialog.current?.showModal();document.body.style.overflow='hidden';} else {dialog.current?.close();document.body.style.overflow='';} return()=>{document.body.style.overflow='';};},[modal]);
 const goTo=(index:number)=>{if(index===0) {window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});setMenu(false);} else if(index<5) {open(index-1);} else window.location.assign(index===5?'/about':'/contact');};
 const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(locked.current)return;locked.current=true;setBusy(true);setError('');try{key.current ||= requestKey();const response=await fetch('/api/requests',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key.current},body:JSON.stringify({...request,kind:modal==='club'?'club':'enquiry',interest,locale,currency,consent:true})});if(!response.ok)throw new Error(u(response.status===429?'rate':'error'));const data=await response.json();setCode(data.trackingCode);setSubmitted(true);}catch(e){setError(e instanceof Error&&[u('notFound'),u('rate'),u('error')].includes(e.message)?e.message:u('error'));}finally{setBusy(false);locked.current=false;}};
 const enquire=(topic:string)=>{setInterest(topic);open('contact');};
 const allChoices=[c.tourismItems,c.beautyItems,c.craftItems,c.aiItems];
 const translatedName=locale==='ar'?'هماي سعادت':'همای سعادت';
 const leatherTitle=locale==='en'?'Homa Leather':locale==='ar'?'جلود هما':'چرم هما';
 const worldCards=[...c.titles.map((title,i)=>({title,image:images[i],id:sections[i],description:c.descriptions[i],href:'/worlds/'+['tourism','beauty','craft','ai'][i]}))];
 worldCards.splice(3,0,{title:leatherTitle,image:'collections/leather-bag.webp',id:'leather',description:locale==='en'?'Bags, belts and everyday leather essentials.':locale==='ar'?'حقائب وأحزمة وإكسسوارات جلدية.':'کیف زنانه و مردانه، کمربند و اکسسوری‌های چرمی.',href:'/worlds/leather'});
 const navItems=c.nav.map((label,i)=>({label,key:String(i),action:()=>goTo(i)}));
 navItems.splice(4,0,{label:leatherTitle,key:'leather',action:()=>window.location.assign('/worlds/leather')});
 return <Localized><>
 <a href="#worlds" className="skip-link">{c.explore}</a>
 <div className="utility-bar"><a href="/help">راهنمای خرید</a><span>{e('utility')}</span><div><a className="account-entry" href="/cart">{locale==='fa'?'سبد خرید':locale==='ar'?'السلة':'Cart'}</a><a className="account-entry" href="/account">{e('account')}</a><a href="#partnership">{e('partnership')}</a><button onClick={()=>open('tracking')}>{u('tracking')}</button></div></div>
 <header className="site-header">
  <a href="#home" className="brand" aria-label="Homay Saadat"><ResponsiveImage src={siteSettings.site_logo||'/assets/brand-mark.png'} alt=""/><span><strong>{siteSettings.site_name||(locale==='en'?'Homay Saadat':translatedName)}</strong><small>{locale==='fa'?'باشگاه مشتریان':locale==='ar'?'نادي العملاء':'CUSTOMERS CLUB'}</small></span></a>
  <nav aria-label={c.nav[0]} className="desktop-nav">{navItems.map(item=><Localized key={item.key}><button onClick={item.action} className={item.key==='0'?'active':''}><span>{item.label}</span></button></Localized>)}<IncomeMenuLink/></nav>
  <div className="header-actions"><ThemeToggle/><label className="sr-only" htmlFor="site-language">{u('language')}</label><select id="site-language" value={locale} onChange={e=>setLocale(e.target.value as Locale)}><option value="en">EN</option><option value="fa">FA</option><option value="ar">AR</option></select><button className="gold-button join-header" onClick={()=>open('club')}>{c.join}<Arrow size={17}/></button><button className="mobile-menu icon-button" onClick={()=>setMenu(!menu)} aria-label={menu?c.close:c.menu} aria-expanded={menu} aria-controls="mobile-navigation">{menu?<X/>:<List/>}</button></div>
 </header>
 {menu&&<nav id="mobile-navigation" className="mobile-nav" onKeyDown={event=>{if(event.key==='Escape'){setMenu(false);document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus();}}} aria-label={c.menu}>{navItems.map(item=><Localized key={item.key}><button onClick={item.action}>{item.label}<Arrow size={18}/></button></Localized>)}<IncomeMenuLink/><button onClick={()=>open('club')}>{c.join}<Gift size={18}/></button></nav>}
 <main id="main" tabIndex={-1}>
 <section className="hero" id="home" aria-labelledby="hero-title">
  <CivilizationHero/>
  <div className="hero-shade"/>
  <div className="hero-content"><p className="eyebrow">{c.eyebrow}</p><h1 id="hero-title">{c.hero}</h1><p className="hero-sub">{c.sub}</p><p className="hero-fa">{c.line}</p><div className="hero-buttons"><a href="#worlds" className="gold-button">{c.explore}<Arrow size={24}/></a><button className="outline-button" onClick={()=>open('story')}>{c.story}<Arrow size={21}/></button></div></div>
  <p className="hero-quote">{c.quote}</p>
 </section>
 <div className="values-strip">{c.values.map((value,i)=>{const Icon=ValueIcons[i];return <Localized key={value}><div><Icon weight="thin"/><span>{value}</span></div></Localized>;})}</div>
 <nav className="brand-home-links" aria-label="خانواده برندهای هما" lang="fa" dir="rtl">{sectorKeys.map(k=><Localized key={k}><a href={'/worlds/'+k}><strong>{brands[k].name}</strong><span>{brands[k].label} ←</span></a></Localized>)}<a className="store-home-link" href="/shop">فروشگاه خانواده هما · انتخاب محصول و سبد خرید</a></nav><PublicContent/><BrandIntroduction onStory={()=>open('story')}/>
 <section className="worlds content-section" id="worlds" aria-labelledby="worlds-title">
  <div className="section-heading"><div><p className="eyebrow">{e('collection')}</p><h2 id="worlds-title">{c.worlds}</h2></div><p>{c.worldsSub}</p></div>
  <div className="world-grid">{worldCards.map((card,i)=><Localized key={card.id}><a id={card.id} className="world-card" href={card.href}><ResponsiveImage src={`/assets/${card.image}`} sizes="(max-width: 600px) 90vw, (max-width: 1000px) 45vw, 28vw" alt={card.title} loading="lazy"/><div className="card-shade"/><div className="world-copy"><span className="world-number">0{i+1}</span><h3>{card.title}</h3><p>{card.description}</p><span className="round-arrow"><Arrow size={21}/></span></div></a></Localized>)}</div>
 </section>
 <HeritageSections/><TravelCollection onEnquire={enquire}/>
 <CraftSection onEnquire={enquire}/><BrandCollection sector="leather"/><BeautySection onCategory={open}/>
 <CreativeStudio onEnquire={enquire}/>
 <section className="gallery-section" aria-labelledby="gallery-title"><div className="gallery-heading"><h2 id="gallery-title">{c.gallery}</h2><p>{c.gallerySub}</p><button onClick={()=>{setGalleryIndex(0);open('gallery');}}>{c.viewGallery}<Arrow size={18}/></button></div><div className="gallery-strip">{galleryImages.map((src,i)=><Localized key={src}><button aria-label={`${c.picture} ${i+1}`} onClick={()=>{setGalleryIndex(i);open('gallery');}}><ResponsiveImage src={`/assets/${src}`} alt={`${c.gallery} — ${i+1}`} sizes={i === galleryImages.length - 1 ? "(max-width: 767px) 90vw, 16vw" : "(max-width: 767px) 45vw, 16vw"} loading="lazy"/></button></Localized>)}</div></section>
 <section id="club" className="club-banner"><div className="club-heading"><h2>{c.club}</h2><p className="club-description">{c.clubSub}</p></div><div className="club-right"><div className="club-perks">{c.perks.map((p,i)=>{const Icon=[Gift,Diamond,UsersThree][i];return <Localized key={p}><div><Icon weight="thin" size={30}/><p>{p}</p></div></Localized>;})}</div><button className="gold-button" onClick={()=>open('club')}>{c.join}<Arrow size={19}/></button></div></section>
 <ClubPreview/>
 <Journal onArticle={index=>{setArticle(index);open('journal');}}/>
 <BusinessPartnership onEnquire={enquire}/>
 <EnquiryProcess/>
 <section className="landing-faq content-section" aria-labelledby="faq-title"><div><p className="eyebrow">{tf('columns.support')}</p><h2 id="faq-title">{f('faqTitle')}</h2><p>{f('faqIntro')}</p><button className="text-button" onClick={()=>open('tracking')}>{u('tracking')}<Arrow size={20}/></button></div><div className="faq-items">{[1,2,3,4].map(i=><Localized key={i}><details><summary>{f(`q${i}`)}</summary><p>{f(`a${i}`)}</p></details></Localized>)}</div></section>
 </main>
 <Footer variant="editorial" introduction={<div className="footer-introduction"><div><p className="eyebrow">{e('collection')}</p><h2>{e('footerTitle')}</h2><p>{e('footerText')}</p></div><div className="footer-contact-actions"><a className="gold-button" href="/contact">{e('footerContact')}<Arrow size={22}/></a><button className="footer-track" onClick={()=>open('tracking')}>{u('tracking')}<Arrow size={18}/></button></div></div>} newsletterSuccessContent={unsubscribe?<div className="newsletter-cancellation"><p>{f('newsletterSave')}</p><a href={`/unsubscribe?token=${unsubscribe}`} rel="nofollow">{u('unsubscribe')}</a></div>:undefined} onSubscribe={subscribe} columns={defaultColumns.map(column=>({...column,links:column.links.map(link=>({...link,onClick:event=>{event.preventDefault(); const index=sections.indexOf(link.href.replace(/^[/#]/,'')); if(index>=0)open(index);else if(link.href==='/leather')window.location.assign('/worlds/leather');else if(link.href==='/club')window.location.assign('/club/ranks');else if(link.href==='/content'){document.getElementById('journal')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}else if(link.href==='/about'||link.href==='/contact')window.location.assign(link.href);else if(['/terms','/privacy'].includes(link.href))window.location.assign('/legal'+link.href);else if(['/booking','/concierge','/contact','/partners'].includes(link.href))enquire(tf(link.labelKey));else{setInfoTitle(tf(link.labelKey));setInfoKey(link.href.slice(1));open('info');}}}))}))} className="landing-footer" logo={<ResponsiveImage src={siteSettings.site_logo||'/assets/brand-mark.png'} alt="" width={58} height={58}/>} currency={currency} onCurrencyChange={changeCurrency} onLocaleChange={l=>setLocale(l as Locale)} homeHref="#home" resolveHref={path=>['/tourism','/beauty','/handicrafts','/ai','/leather'].includes(path)?'/worlds/'+(path==='/handicrafts'?'craft':path.slice(1)):path==='/'?'#home':path==='/content'?'#journal':path==='/club'?'/club/ranks':['/about','/contact'].includes(path)?path:path==='/global-shipping'||path==='/dalarit'?'#international':['/privacy','/terms'].includes(path)?'/legal'+path:'#about'} backToTopTargetId="main" year={2026}/>
 <dialog ref={dialog} className={`experience-dialog ${modal==='gallery'?'gallery-dialog':''}`} onKeyDown={event=>{if(modal==='gallery'&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();setGalleryIndex(i=>(i+(event.key==='ArrowRight'?1:galleryImages.length-1))%galleryImages.length);}}} onCancel={event=>{if(busy)event.preventDefault();else setModal(null);}} onClick={event=>{if(!busy&&event.target===event.currentTarget)setModal(null);}} aria-labelledby="dialog-title">
  <button className="dialog-close icon-button" disabled={busy} onClick={()=>setModal(null)} aria-label={c.close}><X size={24}/></button>
  {modal==='gallery'?<><h2 id="dialog-title">{c.gallery}</h2><ResponsiveImage className="gallery-large" sizes="(max-width: 900px) 90vw, 900px" src={`/assets/${galleryImages[galleryIndex]}`} alt={`${c.picture} ${galleryIndex+1}`}/><div className="gallery-controls"><button className="icon-button" aria-label={c.previous} onClick={()=>setGalleryIndex((galleryIndex+galleryImages.length-1)%galleryImages.length)}><CaretLeft/></button><span>{galleryIndex+1} / {galleryImages.length}</span><button className="icon-button" aria-label={c.next} onClick={()=>setGalleryIndex((galleryIndex+1)%galleryImages.length)}><CaretRight/></button></div></>:
  typeof modal==='number'?<><ResponsiveImage className="dialog-cover" sizes="(max-width: 700px) 90vw, 700px" src={`/assets/${images[modal]}`} alt=""/><p className="eyebrow">{translatedName}</p><h2 id="dialog-title">{c.titles[modal]}</h2><p>{c.detailSub}</p><div className="experience-options">{allChoices[modal].map(choice=><Localized key={choice}><button onClick={()=>{setInterest(choice);open('contact');}}>{choice}<Arrow size={20}/></button></Localized>)}</div></>:
  modal==='journal'?<><ResponsiveImage className="dialog-cover" sizes="(max-width: 700px) 90vw, 700px" src={`/assets/${['tourism.jpg','craft.jpg','collections/ai-human.webp'][article-1]}`} alt=""/><p className="eyebrow">{e(`journal${article}Tag`)}</p><h2 id="dialog-title">{e(`journal${article}Title`)}</h2><p className="story-body">{e(`journal${article}Body`)}</p><button className="editorial-link" onClick={()=>enquire(e(`journal${article}Title`))}>{e('footerContact')}<Arrow size={20}/></button></>:
  modal==='tracking'?<><h2 id="dialog-title">{u('tracking')}</h2><form className="request-form" onSubmit={track}><p>{u('lookupHint')}</p><label>{u('trackingCode')}<input disabled={busy} value={code} onChange={e=>setCode(e.target.value)} dir="ltr" required minLength={73} maxLength={73}/></label><button disabled={busy} className="gold-button">{busy?u('sending'):u('track')}</button>{status&&<p role="status">{u(status)}</p>}{error&&<p role="alert">{error}</p>}</form></>:
  modal==='info'?<><h2 id="dialog-title">{infoTitle}</h2><p className="story-body">{st(infoKey)}</p><button className="gold-button" onClick={()=>{setInterest(infoTitle);open('contact');}}>{u('infoCTA')}<Arrow size={20}/></button><button className="text-button" onClick={()=>open('tracking')}>{u('tracking')}</button></>:modal==='story'?<><ResponsiveImage className="dialog-cover" sizes="(max-width: 700px) 90vw, 700px" src="/assets/heritage/simurgh.webp" alt=""/><p className="eyebrow">{c.about}</p><h2 id="dialog-title">{c.storyTitle}</h2><p className="story-body">{c.storyBody}</p><button className="gold-button" onClick={()=>{setModal(null);document.getElementById('worlds')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}}>{c.explore}<Arrow size={20}/></button></>:
  <><p className="eyebrow">{modal==='club'?u('preview'):c.contact}</p><h2 id="dialog-title">{submitted?u('success'):modal==='club'?c.club:c.plan}</h2>{submitted?<div className="request-review"><p>{u('successBody')}</p><label className="tracking-code">{u('trackingCode')}<input readOnly dir="ltr" value={code} onFocus={e=>e.target.select()}/></label><button className="text-button" onClick={copyCode}>{u('copy')}</button><p role="status">{copyNotice}</p><button className="text-button" onClick={receipt}>{u('download')}</button><button className="text-button" onClick={()=>open('tracking')}>{u('tracking')}</button><dl><dt>{c.name}</dt><dd translate="no">{request.name}</dd><dt>{c.email}</dt><dd dir="ltr">{request.email}</dd><dt>{c.formInterest}</dt><dd>{interest}</dd>{request.message&&<><dt>{c.message}</dt><dd translate="no">{request.message}</dd></>}</dl><button className="gold-button" onClick={()=>{setSubmitted(false);setRequest({name:'',email:'',message:''});key.current='';}}>{u('again')}</button></div>:<form className="request-form" onSubmit={submit} onChange={()=>{key.current='';}}>{modal==='club'&&<p>{u('clubBody')}</p>}<label>{c.formInterest}<select disabled={busy} value={interest} onChange={e=>setInterest(e.target.value)} required><option value="">{c.choose}</option>{Array.from(new Set([...c.titles,...allChoices.flat(),'Dalarit',...(interest?[interest]:[])])).map(v=><Localized key={v}><option>{v}</option></Localized>)}</select></label><div className="form-row"><label>{c.name}<input required minLength={2} maxLength={100} disabled={busy} autoComplete="name" value={request.name} onChange={e=>setRequest({...request,name:e.target.value})}/></label><label>{c.email}<input required maxLength={254} disabled={busy} type="email" autoComplete="email" dir="ltr" value={request.email} onChange={e=>setRequest({...request,email:e.target.value})}/></label></div><label>{c.message}<textarea maxLength={4000} disabled={busy} rows={3} value={request.message} onChange={e=>setRequest({...request,message:e.target.value})}/></label><p className="form-note">{u('requestNote')}</p><label className="consent"><input type="checkbox" required disabled={busy}/>{u('consent')}</label>{error&&<p role="alert">{error}</p>}<button disabled={busy} className="gold-button" type="submit">{busy?u('sending'):u('send')}<Arrow size={20}/></button></form>}</>}
 </dialog>
 </></Localized>;
}
export default function Page(){const {locale,setLocale:changeLocale}=useSiteLocale();return <Localized><NextIntlClientProvider locale={locale} messages={{...translations[locale],Footer:{...translations[locale].Footer,newsletter:{...translations[locale].Footer.newsletter,notice:functionalCopy[locale].newsletterNotice,success:functionalCopy[locale].newsletterDone}},Editorial:editorialCopy[locale],Completion:completionCopy[locale],Runtime:functionalCopy[locale],Sections:sectionContent[locale],Landing:Object.fromEntries(Object.entries(copy[locale]).map(([key,value])=>[key,Array.isArray(value)?Object.fromEntries(value.map((item,i)=>[String(i),item])):value]))}} timeZone="UTC"><Landing locale={locale} setLocale={changeLocale}/></NextIntlClientProvider></Localized>;}
