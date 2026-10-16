import { CommerceShell } from '../../src/commerce/Shell';
import MemberKit from '../../src/platform/MemberKit';
import { siteLocale } from '../../src/i18n/server';
import { memberKitCopy } from '../../src/platform/member-kit-content';
export async function generateMetadata(){const c=memberKitCopy[await siteLocale()];return {title:c.title+' | Homanet',description:c.subtitle};}
export default function MemberKitPage(){return <CommerceShell><main id="commerce-main" className="shop-wrap member-kit-public-page"><MemberKit pageHeading/></main></CommerceShell>;}
