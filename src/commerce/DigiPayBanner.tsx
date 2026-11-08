"use client";

import { useSiteLocale } from "../i18n/SiteLocale";
import "./digipay-banner.css";

const copy = {
  fa: {
    shop: "خرید قسطی با اعتبار دیجی‌پی؛ راهنمای دریافت اعتبار و خرید",
    guide: "خرید قسطی با دیجی‌پی در هما نت؛ ورود به فروشگاه",
    condition: "مدت و شرایط بازپرداخت به طرح و اعتبار تأییدشده توسط دیجی‌پی بستگی دارد.",
    shopAction: "راهنمای خرید با دیجی‌پی",
    guideAction: "مشاهده محصولات فروشگاه",
  },
  en: {
    shop: "Installment shopping with DigiPay credit: credit and purchase guide",
    guide: "Shop in installments with DigiPay at Homanet: visit the store",
    condition: "Repayment terms depend on the plan and credit approved by DigiPay.",
    shopAction: "DigiPay purchase guide",
    guideAction: "Explore the store",
  },
  ar: {
    shop: "التسوق بالتقسيط باستخدام رصيد ديجي‌بي: دليل الرصيد والشراء",
    guide: "التسوق بالتقسيط عبر ديجي‌بي في هما نت: زيارة المتجر",
    condition: "تعتمد مدة السداد وشروطه على الخطة والائتمان المعتمد من ديجي‌بي.",
    shopAction: "دليل الشراء عبر ديجي‌بي",
    guideAction: "تصفح المتجر",
  },
} as const;

/** Images retain their full framing; text actions remain readable on small screens. */
export default function DigiPayBanner({ variant }: { variant: "shop" | "guide" }) {
  const { locale } = useSiteLocale();
  const text = copy[locale];
  const isShop = variant === "shop";
  return <aside className={`digipay-art-banner digipay-art-banner--${variant}`} dir={locale === "en" ? "ltr" : "rtl"}>
    <a href={isShop ? "/digipay" : "/shop"} className="digipay-art-banner-image" aria-label={isShop ? text.shop : text.guide}>
      <img src={isShop ? "/assets/digipay-installments.webp" : "/assets/digipay-homanet.webp"} width="1672" height="941" alt="" loading="lazy" />
    </a>
    <div className="digipay-art-banner-caption">
      <p>{text.condition}</p>
      <a href={isShop ? "/digipay" : "/shop"}>{isShop ? text.shopAction : text.guideAction} <span aria-hidden="true">{locale === "en" ? "→" : "←"}</span></a>
    </div>
  </aside>;
}
