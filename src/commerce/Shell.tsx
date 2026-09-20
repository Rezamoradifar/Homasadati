import ThemeToggle from './ThemeToggle';
import type { ReactNode } from "react";
import { brands, sectorKeys } from "./brands";
import "./commerce.css";
import "../../app/heritage.css";
export function CommerceShell({ children }: { children: ReactNode }) {
  return (
    <div className="commerce" dir="rtl" lang="fa">
      <a className="commerce-skip" href="#commerce-main">
        رفتن به محتوا
      </a>
      <header className="commerce-header">
        <a className="commerce-logo" href="/">
          <img src="/assets/brand-mark.png" alt="" />
          <span>
            خانواده هما<small>HOMAY SAADAT</small>
          </span>
        </a>
        <nav aria-label="بخش‌های خانواده هما">
          {sectorKeys.map((k) => (
            <a key={k} href={`/worlds/${k}`}>
              {brands[k].name}
            </a>
          ))}
        </nav>
        <div><ThemeToggle/>
          <a href="/income-plan">طرح درآمد</a>
          <a href="/shop">فروشگاه</a>
          <a href="/cart">سبد خرید</a>
          <a href="/account">حساب من</a>
        </div>
      </header>
      {children}
      <footer className="commerce-footer">
        <div>
          <h2>ریشه در ایران، رو به جهان.</h2>
          <p>
            گردشگری، هنر، مراقبت، فناوری و طراحی؛ پنج مسیر برای انتخاب آگاهانه.
          </p>
        </div>
        <nav aria-label="برندها">
          {sectorKeys.map((k) => (
            <a key={k} href={`/worlds/${k}`}>
              {brands[k].name} · {brands[k].label}
            </a>
          ))}
        </nav>
        <nav aria-label="خدمات">
          <a href="/shop">فروشگاه و مشخصات محصولات</a>
          <a href="/cart">سبد خرید و پرداخت</a>
          <a href="/account?tab=orders">پیگیری سفارش‌ها</a>
          <a href="/account?tab=addresses">آدرس‌های ارسال</a>
          <a href="/heritage">روایت ایران و نمادها</a><a href="/income-plan">طرح درآمد</a><a href="/legal/terms">قوانین و مقررات</a><a href="/legal/privacy">حریم خصوصی</a><a href="/">بازگشت به صفحه اصلی</a>
        </nav>
        <p>© {new Date().getFullYear()} همای سعادت</p>
      </footer>
    </div>
  );
}
