import ContactDetails from "./ContactDetails";

import Localized from "../i18n/Localized";
import StoreHeader from "./StoreHeader";
import type { ReactNode } from "react";
import { brands, menuSectors } from "./brands";
import "./commerce.css";
import "../../app/heritage.css";
export function CommerceShell({ children }: { children: ReactNode }) {
  return (
    <Localized><div className="commerce" dir="rtl" lang="fa" id="page-top">
      <a className="commerce-skip" href="#commerce-main">
        رفتن به محتوا
      </a>
      <StoreHeader />
      {children}
      <footer
        className="commerce-footer"
        aria-label="پیوندها و خدمات همای سعادت"
      >
        <div>
          <img
            className="footer-brand-mark"
            src="/assets/brand-mark.png"
            alt="همای سعادت"
          />
          <h2>ریشه در ایران، رو به جهان.</h2><ContactDetails compact/>
          <p>
            گردشگری، هنر، مراقبت، فناوری و طراحی؛ پنج مسیر برای انتخاب آگاهانه.
          </p>
        </div>
        <details open>
          <summary>جهان‌های همای</summary>
          <nav aria-label="برندها">
            {menuSectors.map((k) => (
              <Localized key={k}><a href={`/worlds/${k}`}>
                {brands[k].name} · {brands[k].label}
              </a></Localized>
            ))}
          </nav>
        </details>
        <details open>
          <summary>خدمات و همراهی</summary>
          <nav aria-label="خدمات">
            <a href="/shop">فروشگاه و مشخصات محصولات</a>
            <a href="/cart">سبد خرید و پرداخت</a>
            <a href="/account?tab=orders">پیگیری سفارش‌ها</a>
            <a href="/account?tab=addresses">آدرس‌های ارسال</a>
            <a href="/heritage">روایت ایران و نمادها</a>
            <a href="/club">باشگاه مشتریان</a>
          <a href="/club/ranks">هفت رتبه باشگاه</a>
          <a href="/merchants">پذیرندگان</a>
            <a href="/income-plan">طرح درآمد</a>
            <a href="/help">راهنمای خرید و پشتیبانی</a>
            <a href="/about">درباره شرکت و مدیریت</a><a href="/about#licenses">مجوزها و اسناد</a><a href="/contact">ارتباط با ما</a><a href="/legal/terms">قوانین و مقررات</a>
            <a href="/legal/privacy">حریم خصوصی</a>
            <a href="/">بازگشت به صفحه اصلی</a>
          </nav>
        </details>
        <div className="commerce-footer-bottom">
          <p>© {new Date().getFullYear()} همای سعادت · از ایران، برای جهان</p>
          <a href="#page-top">بازگشت به بالا ↑</a>
        </div>
      </footer>
    </div></Localized>
  );
}
