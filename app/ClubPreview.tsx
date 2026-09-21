"use client";

import Localized from "../src/i18n/Localized";
import {useLocale} from "next-intl";
import ClubCards from "./ClubCards";
export default function ClubPreview() {
  return <Localized><ClubCards locale={useLocale()} /></Localized>;
}
