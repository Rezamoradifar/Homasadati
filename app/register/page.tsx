'use client';

import Localized from "../../src/i18n/Localized";
import Registration from '../../src/platform/Registration';
import '../../src/platform/panel.css';
export default function Page(){return <Localized><main className="portal" dir="rtl" lang="fa" style={{padding:'24px 16px'}}><a href="/">← همای سعادت</a><Registration onBack={()=>window.location.assign('/account')} onLogin={()=>window.location.assign('/account')}/></main></Localized>}
