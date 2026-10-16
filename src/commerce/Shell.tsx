import ContactDetails from "./ContactDetails";
import FooterBrandLogo from "./FooterBrandLogo";
import SiteHeader from "./SiteHeader";
import ThemeToggle from "./ThemeToggle";
import Localized from "../i18n/Localized";
import type { ReactNode } from "react";
import { menuLine, menuSectors } from "./brands";
import "./commerce.css";
import "../../app/heritage.css";

export function CommerceShell({ children, tourism = false }: { children: ReactNode; tourism?: boolean }) {
  return (
    <Localized>
      <div className={tourism ? "commerce commerce-tourism" : "commerce"} dir="rtl" lang="fa" id="page-top">
        <a className="commerce-skip" href="#commerce-main">رفتن به محتوا</a>
        <SiteHeader tourism={tourism} />
        {children}
        <footer className="commerce-footer commerce-footer-compact" aria-label="پیوندها و خدمات هما نت">
          <section className="commerce-footer-brand" aria-label="اطلاعات هما نت">
            <FooterBrandLogo />
            <h2>ریشه در ایران، رو به جهان.</h2>
            <p className="commerce-footer-tagline">
              گردشگری، هنر، زیبایی و فناوری؛ همراه شما در انتخابی آگاهانه.
            </p>
            <ContactDetails compact hideNav />
            <div className="commerce-footer-mode"><ThemeToggle /></div>
          </section>

          <section className="commerce-footer-section" aria-label="جهان‌های هما">
            <h2>جهان‌های هما</h2>
            <nav aria-label="خدمات و دنیای هما">
              {menuSectors.map((sector) => (
                <Localized key={sector}>
                  <a href={`/worlds/${sector}`}>{menuLine(sector)}</a>
                </Localized>
              ))}
            </nav>
          </section>

          <section className="commerce-footer-section" aria-label="دسترسی سریع و راهنما">
            <h2>دسترسی سریع</h2>
            <nav aria-label="پیوندهای اصلی">
              <a href="/shop">فروشگاه</a>
              <a href="/cart">سبد خرید و پرداخت</a>
              <a href="/account?tab=orders">پیگیری سفارش‌ها</a>
              <a href="/club">باشگاه مشتریان</a>
              <a href="/support">پشتیبانی و تیکت</a>
              <a href="/contact">ارتباط با ما</a>
              <a href="/legal/terms">قوانین و مقررات</a>
              <a href="/legal/privacy">حریم خصوصی</a>
            </nav>
            <details className="commerce-footer-more">
              <summary>پیوندهای بیشتر</summary>
              <nav aria-label="سایر صفحات و خدمات">
                <a href="/account?tab=addresses">آدرس‌های ارسال</a>
                <a href="/heritage">روایت ایران و نمادها</a>
                <a href="/club/ranks">هفت کارت باشگاه</a>
                <a href="/merchants">پذیرندگان</a>
                <a href="/income-plan">طرح درآمد</a>
                <a href="/member-kit">ابزار معرفی</a>
                <a href="/help">راهنمای خرید</a>
                <a href="/about">درباره شرکت و مدیریت</a>
                <a href="/about#licenses">مجوزها و اسناد</a>
                <a href="/">صفحه اصلی</a>
              </nav>
            </details>
          </section>

          <div className="commerce-footer-bottom">
            <p>© {new Date().toLocaleDateString("fa-IR-u-ca-persian", {
              year: "numeric",
              timeZone: "Asia/Tehran",
            })} هما نت · از ایران، برای جهان</p>
            <a href="#page-top">بازگشت به بالا ↑</a>
          </div>
        </footer>
      </div>
    </Localized>
  );
}
