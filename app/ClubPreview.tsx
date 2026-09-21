"use client";
import {useLocale} from "next-intl";
import ClubCards from "./ClubCards";
export default function ClubPreview() {
  return <ClubCards locale={useLocale()} />;
}
