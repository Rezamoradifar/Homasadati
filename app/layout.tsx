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
export default function Layout({children}: {children:ReactNode}){return <html lang="en"><body>{children}</body></html>;}
