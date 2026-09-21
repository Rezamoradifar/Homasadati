import { CommerceShell } from "../../src/commerce/Shell";
import ContactDetails from "../../src/commerce/ContactDetails";
import Localized from "../../src/i18n/Localized";
export default function Contact() {
  return (
    <Localized>
      <CommerceShell>
        <main id="commerce-main" className="shop-wrap company-page">
          <header className="company-heading">
            <p className="commerce-eyebrow">میراث جاویدان ایرانیان</p>
            <h1>ارتباط با ما</h1>
            <p>
              برای پرسش درباره محصولات، همکاری یا پیگیری سفارش با ما در ارتباط
              باشید.
            </p>
          </header>
          <section className="company-contact-panel">
            <h2>راه‌های ارتباط رسمی مجموعه</h2>
            <ContactDetails />
            <p>برای پیگیری خرید، شناسه سفارش را آماده داشته باشید.</p>
            <div className="company-actions">
              <a className="commerce-button" href="/account?tab=orders">
                پیگیری سفارش
              </a>
              <a className="commerce-button outline" href="/help">
                راهنمای خرید
              </a>
            </div>
          </section>
          <section className="company-contact-panel">
            <h2>آشنایی با مجموعه</h2>
            <p>
              نام شرکت «میراث جاویدان ایرانیان» است و «همای سعادت» برند این
              مجموعه است.
            </p>
            <a href="/about#licenses">معرفی شرکت، مدیریت و مشاهده مجوزها</a>
          </section>
        </main>
      </CommerceShell>
    </Localized>
  );
}
