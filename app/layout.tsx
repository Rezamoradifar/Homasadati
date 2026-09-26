import {SiteLocaleProvider} from '../src/i18n/SiteLocale';
import {siteLocale} from '../src/i18n/server';
import {direction,loadDictionary} from '../src/i18n/core';
import {all} from '../src/platform/schema';
import {SiteSettingsProvider} from '../src/platform/SiteSettings';
import {CurrencyProvider} from '../src/commerce/currency';
import {currentUsdRate} from '../src/platform/fx';
export const dynamic='force-dynamic';
import './brand.css';
import './globals.css';
import './collections.css';
import './theme.css';
import './refinements.css';
import './mobile.css';
import './design-system.css';
import './club-cards.css';
import './editorial-sections.css';
import '@fontsource/vazirmatn/800.css';
import ScrollState from './ScrollState';
import {JsonLd,organizationJsonLd,siteOrigin} from '../src/platform/seo';
import '@fontsource/vazirmatn/300.css';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/600.css';
import '@fontsource/vazirmatn/700.css';
import type {Metadata} from 'next';
import type {ReactNode} from 'react';
export async function generateMetadata():Promise<Metadata>{const locale=await siteLocale();const title=locale==='en'?'Homanet Club':locale==='ar'?'نادي عملاء هما نت':'باشگاه مشتریان هما نت';const description=locale==='en'?'The Homanet club: travel, handicrafts, leather, beauty and technology.':locale==='ar'?'نادي عملاء هماي؛ السفر والحرف اليدوية والجلود والجمال والتكنولوجيا.':'باشگاه مشتریان همای؛ گردشگری، صنایع‌دستی، چرم، زیبایی و فناوری.';return {metadataBase:new URL(siteOrigin()),title:{default:title,template:'%s | '+(locale==='en'?'Homanet':'هما نت')},description,alternates:{canonical:'./'},openGraph:{type:'website',siteName:locale==='en'?'Homanet':'هما نت',title,description,locale:locale==='en'?'en_US':locale==='ar'?'ar_AR':'fa_IR',images:[{url:'/assets/tourism.jpg',alt:title}]},twitter:{card:'summary_large_image',title,description,images:['/assets/tourism.jpg']},robots:{index:true,follow:true}};}
export default async function Layout({children}: {children:ReactNode}){const locale=await siteLocale(),dictionary=await loadDictionary(locale);const settings=Object.fromEntries(all("SELECT key,value FROM p_settings WHERE secret=0 AND key IN ('site_name','site_logo','site_contact','site_email','site_landline','site_address','site_postal_code','company_national_id','company_registration_no','enamad_id','enamad_code')").map(r=>[r.key,r.value]));return <html lang={locale} dir={direction(locale)} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html: "try{var t=localStorage.getItem('homa-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){}"}}/></head><body><JsonLd data={organizationJsonLd()}/><ScrollState/><SiteLocaleProvider initialLocale={locale} initialDictionary={dictionary}><SiteSettingsProvider value={settings}><CurrencyProvider usd={currentUsdRate()}>{children}</CurrencyProvider></SiteSettingsProvider></SiteLocaleProvider></body></html>;}
