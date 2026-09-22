import { translatedMetadata } from "../../src/i18n/server";
export async function generateMetadata() { return translatedMetadata({ title: "مدیریت همای سعادت", robots: { index: false, follow: false } }); }

import Localized from "../../src/i18n/Localized";
import Portal from "../../src/platform/Portal";
export default function Admin() {
  return <Localized><Portal admin /></Localized>;
}
