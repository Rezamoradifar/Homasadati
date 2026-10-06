import { CommerceShell } from "../../src/commerce/Shell";
import Localized from "../../src/i18n/Localized";
export const metadata = { title: "مرکز پشتیبانی | همانت" };
export default function Support() {
  return <Localized><CommerceShell><main id="commerce-main" className="shop-wrap help-page" data-support-version="2026-10-06">
    <header><p className="commerce-eyebrow">باشگاه مشتریان هما نت</p><h1>مرکز پشتیبانی</h1><p>برای پیگیری خرید، پرداخت یا حساب کاربری، درخواست خود را ثبت کنید.</p></header>
    <section className="company-contact-panel"><h2>ثبت و پیگیری تیکت</h2><p>درخواست شما در حساب کاربری ذخیره می‌شود. پاسخ‌های پشتیبانی و وضعیت رسیدگی را در همان گفت‌وگو ببینید.</p><div className="company-actions"><a className="commerce-button" href="/account?tab=tickets">ثبت تیکت و مشاهده پاسخ‌ها</a><a className="commerce-button outline" href="/help">راهنمای خرید</a></div><p>برای ثبت تیکت، ابتدا وارد حساب خود شوید.</p></section>
    <section className="company-contact-panel"><h2>چه اطلاعاتی بنویسم؟</h2><ul><li>موضوع درخواست و شرح مسئله</li><li>شناسه سفارش، اگر درخواست مربوط به خرید است</li><li>متن خطایی که مشاهده می‌کنید</li></ul><p>رمز عبور، کد تأیید و اطلاعات کامل کارت بانکی را در تیکت ننویسید.</p></section>
    <section className="company-contact-panel"><h2>درخواست‌های قبلی</h2><p>برای ادامه پیگیری، در همان تیکت پاسخ دهید تا سابقه گفت‌وگو یکجا بماند.</p><a href="/account?tab=tickets">مشاهده تیکت‌های من</a></section>
  </main></CommerceShell></Localized>;
}
