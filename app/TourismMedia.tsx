"use client";
import { useState } from "react";
export default function TourismMedia() {
  const [failed, setFailed] = useState(false);
  const audio = process.env.NEXT_PUBLIC_TOURISM_NARRATION_URL;
  return (
    <section className="tourism-media" dir="rtl">
      <p className="commerce-eyebrow">IRAN, A LIVING STORY</p>
      <h2>سفری به قلب تمدن ایران</h2>
      {!failed ? (
        <video
          controls
          playsInline
          preload="none"
          poster="/assets/heritage/persepolis.webp"
          onError={() => setFailed(true)}
          aria-label="فیلم بازسازی تخت‌جمشید"
        >
          <source
            src={
              process.env.NEXT_PUBLIC_HERO_VIDEO_URL ||
              "https://upload.wikimedia.org/wikipedia/commons/5/53/Persepolis%2C_Hauptstadt_Persiens_%28CC_BY-SA_4.0%29.webm"
            }
          />
        </video>
      ) : (
        <p role="alert">
          فیلم بارگذاری نشد. اتصال اینترنت را بررسی کنید.{" "}
          <button onClick={() => setFailed(false)}>تلاش دوباره</button>
        </p>
      )}
      <p className="media-credit">
        بازسازی هنری تخت‌جمشید، ZDF / Terra X؛{" "}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY-SA 4.0
        </a>
        . نشان سازنده متعلق به منبع فیلم است. <a href="https://commons.wikimedia.org/wiki/File:Persepolis,_Hauptstadt_Persiens_(CC_BY-SA_4.0).webm" target="_blank" rel="noreferrer">صفحه منبع فیلم</a>
      </p>
      <article>
        <h3>روایت سفر</h3>
        <p>
          ایران را می‌توان آرام‌تر شناخت؛ در سایه ستون‌های پارسه، در کوچه‌های
          یزد و در گفت‌وگو با هنرمندی که نقش‌های کهن را به زندگی امروز می‌آورد.
          در همای سعادت، سفر فرصتی برای دیدن، شنیدن و همراه شدن با فرهنگ زنده
          ایران است. مقصد و زمان سفر را با کارگزار گردشگری هماهنگ کنید تا برنامه
          متناسب با علاقه، بودجه و نیاز شما بررسی شود.
        </p>
        {audio ? (
          <audio
            controls
            preload="none"
            src={audio}
            aria-label="روایت صوتی گردشگری ایران"
          />
        ) : (
          <p className="media-credit">
            نسخه صوتی پس از بارگذاری اجرای مجاز گوینده منتشر می‌شود.
          </p>
        )}
      </article>
      <article className="travel-benefit-intro">
        <h3>از هنر ایرانی تا تجربه سفر</h3>
        <p>
          اعضای باشگاه که از هما تمدن خرید واجد شرایط داشته باشند، برای هر رتبه
          مشمول، یک کارت سفر به نام خود دریافت می‌کنند. مبلغ و اعتبار زمانی هر
          کارت طبق تنظیمات مصوب همان رتبه است؛ پس از پایان مهلت لغو خرید و احراز
          شرایط، کارت در حساب کاربری صادر می‌شود.
        </p>
        <p>
          اعتبار کارت غیرنقدی است. برای استفاده از سفرهای موجود، حداقل ۷ روز
          کاری کامل پیش از تاریخ سفر درخواست خود را ثبت کنید. کارگزار شرکت
          ظرفیت، مابه‌التفاوت هزینه و شرایط سفر را بررسی می‌کند؛ ثبت درخواست
          به‌تنهایی تأیید رزرو نیست. تعطیلات ثبت‌شده و روزهای تعطیل هفتگی در
          محاسبه این مهلت لحاظ می‌شوند.
        </p>
        <a className="commerce-button gold" href="/account?tab=travel-cards">
          کارت سفر و درخواست هماهنگی
        </a>
      </article>
    </section>
  );
}
