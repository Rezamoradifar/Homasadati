import {all} from '../src/platform/schema';
import {SiteSettingsProvider} from '../src/platform/SiteSettings';
export const dynamic='force-dynamic';
import './globals.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/vazirmatn/300.css';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/600.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import type {Metadata} from 'next';
import type {ReactNode} from 'react';
export const metadata: Metadata={title:'Homay Saadat | همای سعادت',description:'A more beautiful world. Travel, beauty, Persian craftsmanship and creative technology.'};
export default function Layout({children}: {children:ReactNode}){const settings=Object.fromEntries(all("SELECT key,value FROM p_settings WHERE secret=0 AND key IN ('site_name','site_logo','site_contact')").map(r=>[r.key,r.value]));return <html lang="en"><body><SiteSettingsProvider value={settings}>{children}</SiteSettingsProvider></body></html>;}
