import { CommerceShell } from "../../src/commerce/Shell";
import Localized from "../../src/i18n/Localized";
import { all } from "../../src/platform/schema";
export default function Help() {
  const contact = all(
    "SELECT value FROM p_settings WHERE key='site_contact' AND secret=0",
  )[0]?.value;
  return (
    <Localized>
      <CommerceShell>
        <main id="commerce-main" className="shop-wrap help-page">
          <header>
            <p className="commerce-eyebrow">باشگاه مشتریان همای سعادت</p>
            <h1>راهنمای خرید و پشتیبانی</h1>
            <p>از انتخاب محصول تا دریافت سفارش، مسیر خود را اینجا پیدا کنید.</p>
          </header>
          <nav className="help-actions" aria-label="دسترسی سریع">
            <a href="/account?tab=orders">پیگیری سفارش</a>
            <a href="/account?tab=addresses">نشانی‌های ارسال</a>
            <a href="/account?tab=security">امنیت حساب</a>
            <a href="/club/ranks">مقایسه کارت‌ها</a>
          </nav>
          <section>
            <h2>چهار قدم تا ثبت سفارش</h2>
            <ol>
              <li>مشخصات، تصاویر، موجودی و شرایط تحویل محصول را بررسی کنید.</li>
              <li>
                کالا را به سبد اضافه کنید؛ افزودن به سبد به معنی رزرو موجودی
                نیست.
              </li>
              <li>
                وارد حساب شوید، نشانی تحویل را انتخاب و مبلغ نهایی را بررسی
                کنید.
              </li>
              <li>
                پرداخت را تکمیل کنید؛ نتیجه را از بخش سفارش‌های حساب دنبال کنید.
              </li>
            </ol>
          </section>
          <section className="help-faq">
            <h2>پرسش‌های پرتکرار</h2>
            <details>
              <summary>بعد از پرداخت چگونه سفارش را پیگیری کنم؟</summary>
              <p>
                در حساب کاربری، بخش سفارش‌ها را باز کنید. شناسه، وضعیت پرداخت و
                جزئیات سفارش آنجا نمایش داده می‌شود. پرداخت تأییدنشده به معنی
                خرید نهایی نیست.
              </p>
            </details>
            <details>
              <summary>چگونه سفارش را لغو کنم؟</summary>
              <p>
                مهلت لغو در جزئیات سفارش مشخص است. برای سفارش واجد شرایط، بازگشت
                وجه به کیف پول با تأیید شما انجام می‌شود؛ برای انتقال بانکی
                درخواست برداشت ثبت کنید.
              </p>
              <a href="/legal/terms">قوانین و مقررات</a>
            </details>
            <details>
              <summary>کد تأیید نرسیده است؛ چه کنم؟</summary>
              <p>
                نشانی ایمیل یا شماره با پیش‌شماره کشور را بررسی کنید. برای ایمیل
                پوشه هرزنامه را هم ببینید. پس از پایان شمارش، ارسال دوباره کد در
                دسترس است؛ فقط جدیدترین کد معتبر خواهد بود.
              </p>
            </details>
            <details>
              <summary>آیا کارت باشگاه موجودی نقدی است؟</summary>
              <p>
                خیر. اعتبار سفر غیرنقدی است و با کیف پول تفاوت دارد. صدور و
                استفاده به رتبه، خرید واجد شرایط و هماهنگی با کارگزار وابسته
                است.
              </p>
            </details>
            <details>
              <summary>چطور از گوگل وارد حساب قبلی شوم؟</summary>
              <p>
                ابتدا با روش قبلی وارد شوید؛ از بخش امنیت، حساب گوگل را با تأیید
                رمز و عامل دوم متصل کنید. حساب‌های دارای ایمیل مشابه خودکار
                ادغام نمی‌شوند.
              </p>
            </details>
          </section>
          <section className="help-contact">
            <h2>ارتباط با مجموعه</h2>
            {contact ? (
              <p translate="no" className="contact-details">
                {contact}
              </p>
            ) : (
              <p>
                اطلاعات تماس مجموعه هنوز تکمیل نشده است؛ برای سفارش ثبت‌شده،
                شناسه و وضعیت را در حساب خود بررسی کنید.
              </p>
            )}
            <p>
              هنگام پیگیری، شناسه سفارش و شرح مسئله را آماده داشته باشید. رمز
              عبور، کد یک‌بارمصرف و کدهای بازیابی را ارسال نکنید.
            </p>
          </section>
        </main>
      </CommerceShell>
    </Localized>
  );
}
