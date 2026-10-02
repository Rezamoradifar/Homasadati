"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Localized from "../i18n/Localized";
import { useSiteLocale } from "../i18n/SiteLocale";
import {
  DESK_WEEKLY_CAP,
  MATCH_REWARD,
  MATCH_VOLUME,
  SIMURGH_CASHBACK,
  sevenCards,
} from "../platform/card-levels";

/** Member-facing slide presentation of the seven-card plan. Every number is
 * read from the same model the settlement engine uses. */
export default function PlanPresentation() {
  const { locale } = useSiteLocale();
  const n = (v: number) => v.toLocaleString(locale === "en" ? "en-US" : "fa-IR");
  const million = (v: number) => n(v / 1_000_000);
  const [index, setIndex] = useState(0);
  const touch = useRef<number | null>(null);

  const slides = [
    <section key="cover" className="plan-slide plan-cover">
      <img src="/assets/brand-mark.png" alt="" width={96} height={96} />
      <p className="plan-kicker">باشگاه همراهان هما نت</p>
      <h1>طرح هشت کارت</h1>
      <p className="plan-lead">خرید واقعی، پاداش شفاف، محاسبهٔ دقیق هفتگی</p>
      <p className="plan-hint">برای رفتن به اسلاید بعد، روی دکمهٔ «بعدی» بزنید یا صفحه را بکشید.</p>
    </section>,

    <section key="steps" className="plan-slide">
      <h2>مسیر شما در چهار گام</h2>
      <ol className="plan-steps">
        <li>
          <strong>عضویت رایگان</strong>
          <span>ثبت‌نام فقط با ایمیل و کد تأیید؛ با کد معرف یا بدون آن.</span>
        </li>
        <li>
          <strong>خرید محصول یا خدمت</strong>
          <span>جمع خریدهای پرداخت‌شدهٔ شما، کارت شما را تعیین می‌کند.</span>
        </li>
        <li>
          <strong>ساختن دو شاخه</strong>
          <span>اعضای جدید در شاخهٔ چپ یا راست شما قرار می‌گیرند و خریدشان حجم آن شاخه می‌شود.</span>
        </li>
        <li>
          <strong>پاداش تعادل هفتگی</strong>
          <span>وقتی هر دو شاخه به حجم لازم برسند، پاداش هر هفته محاسبه و به کیف پول واریز می‌شود.</span>
        </li>
      </ol>
    </section>,

    <section key="cards" className="plan-slide">
      <h2>هشت کارت باشگاه</h2>
      <p className="plan-lead">هر کارت با جمع خریدهای شما مشخص می‌شود و تعداد میزهای کار و سقف هفتگی را تعیین می‌کند.</p>
      <div className="plan-cards">
        {sevenCards.map((c) => (
          <div key={c.level} className={"plan-card rank-" + c.tone}>
            <span className="plan-card-level">{n(c.level)}</span>
            <strong>{locale === "en" ? c.english : c.name}</strong>
            <small>
              از {million(c.minToman)} میلیون تومان
            </small>
            <dl>
              <div>
                <dt>میز کار</dt>
                <dd>{n(c.desks)}</dd>
              </div>
              <div>
                <dt>سقف هفتگی</dt>
                <dd>{million(c.weeklyCapToman)} میلیون</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </section>,

    <section key="match" className="plan-slide">
      <h2>پاداش تعادل</h2>
      <div className="plan-equation" dir="ltr">
        <div className="plan-leg">
          <span dir="rtl">شاخهٔ چپ</span>
          <strong>{million(MATCH_VOLUME)}</strong>
          <small dir="rtl">میلیون تومان</small>
        </div>
        <span className="plan-op">+</span>
        <div className="plan-leg">
          <span dir="rtl">شاخهٔ راست</span>
          <strong>{million(MATCH_VOLUME)}</strong>
          <small dir="rtl">میلیون تومان</small>
        </div>
        <span className="plan-op">=</span>
        <div className="plan-leg plan-reward">
          <span dir="rtl">پاداش</span>
          <strong>{n(MATCH_REWARD / 1_000_000)}</strong>
          <small dir="rtl">میلیون تومان</small>
        </div>
      </div>
      <ul className="plan-points">
        <li>هر بار که هر دو شاخه به این حجم برسند، یک تعادل ثبت می‌شود.</li>
        <li>حجم اضافهٔ هر شاخه از بین نمی‌رود و برای تعادل‌های بعدی می‌ماند.</li>
        <li>حجم، از خریدهای پرداخت‌شدهٔ اعضای هر شاخه ساخته می‌شود؛ خرید شخصی شما در حجم خودتان حساب نمی‌شود.</li>
      </ul>
    </section>,

    <section key="desks" className="plan-slide">
      <h2>میزهای کار و سقف هفتگی</h2>
      <div className="plan-highlight">
        <strong>{million(DESK_WEEKLY_CAP)} میلیون تومان</strong>
        <span>سقف پاداش هر میز کار در هر هفته</span>
      </div>
      <ul className="plan-points">
        <li>کارت شمارهٔ n، تعداد n میز کار دارد؛ میزها به ترتیب پر می‌شوند.</li>
        <li>
          برای نمونه، کارت سیمرغ ۷ میز دارد و سقف هفتگی آن {million(7 * DESK_WEEKLY_CAP)} میلیون تومان است.
        </li>
        <li>اگر پاداش یک تعادل از سقف هفته بیشتر شود، باقی‌ماندهٔ آن در ابتدای هفتهٔ بعد پرداخت می‌شود.</li>
      </ul>
    </section>,

    <section key="voucher" className="plan-slide">
      <h2>ووچر خرید؛ تعادل هشتم</h2>
      <div className="plan-eight" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className={i === 7 ? "voucher" : "cash"}>
            {n(i + 1)}
          </span>
        ))}
      </div>
      <ul className="plan-points">
        <li>از هر هشت تعادل شما، هفت پاداش نقدی به کیف پول واریز می‌شود.</li>
        <li>پاداش تعادل هشتم به‌طور کامل ووچر خرید است و جزو سقف هفتگی حساب می‌شود.</li>
        <li>ووچر را هنگام خرید از سایت، به‌جای بخشی یا همهٔ مبلغ سبد استفاده کنید؛ ووچر قابل برداشت نقدی نیست.</li>
      </ul>
    </section>,

    <section key="simurgh" className="plan-slide">
      <h2>هدیهٔ ویژهٔ کارت سیمرغ</h2>
      <div className="plan-highlight rank-obsidian">
        <strong>{million(SIMURGH_CASHBACK)} میلیون تومان</strong>
        <span>بازگشت وجه به کیف پول</span>
      </div>
      <ul className="plan-points">
        <li>
          برای اولین خرید یکجای {million(sevenCards[6].minToman)} میلیون تومان یا بیشتر؛ خرید چندمرحله‌ای مشمول
          این هدیه نیست.
        </li>
        <li>اگر آن خرید مرجوع شود، این مبلغ هم برگشت می‌خورد.</li>
      </ul>
    </section>,

    <section key="week" className="plan-slide">
      <h2>محاسبه و واریز هفتگی</h2>
      <ol className="plan-steps">
        <li>
          <strong>شروع هفته</strong>
          <span>هر هفته از شنبه ساعت ۰۰:۰۰ به وقت تهران شروع می‌شود.</span>
        </li>
        <li>
          <strong>قطعی‌شدن خرید</strong>
          <span>هر خرید پس از پایان مهلت لغو و در صورت مرجوع‌نشدن وارد حجم می‌شود.</span>
        </li>
        <li>
          <strong>تسویهٔ خودکار</strong>
          <span>سیستم تعادل‌ها را محاسبه و پاداش نقدی و ووچر را ثبت می‌کند.</span>
        </li>
      </ol>
    </section>,

    <section key="withdraw" className="plan-slide">
      <h2>برداشت امن</h2>
      <ol className="plan-steps">
        <li>
          <strong>فعال‌کردن رمزساز</strong>
          <span>از بخش امنیت حساب، تأیید دومرحله‌ای را روشن کنید.</span>
        </li>
        <li>
          <strong>ثبت اطلاعات بانکی</strong>
          <span>کد ملی، شماره کارت و شبای به نام خودتان را ثبت کنید تا کارشناس مالی تأیید کند.</span>
        </li>
        <li>
          <strong>درخواست برداشت</strong>
          <span>موجودی قابل برداشت فقط به شبای تأییدشدهٔ شما واریز می‌شود.</span>
        </li>
      </ol>
    </section>,

    <section key="honest" className="plan-slide">
      <h2>شفاف و قانونی</h2>
      <ul className="plan-points">
        <li>درآمد فقط از فروش واقعی کالا و خدمت ساخته می‌شود؛ صرف ثبت‌نام یا معرفی افراد درآمدی ندارد.</li>
        <li>درآمد تضمین‌شده، سود ثابت یا وعدهٔ بازگشت سرمایه وجود ندارد.</li>
        <li>مرجوعی یک خرید، پاداش‌های مرتبط با آن را برمی‌گرداند.</li>
        <li>پرداخت پاداش‌ها از زمان فعال‌سازی رسمی طرح در سایت آغاز می‌شود.</li>
      </ul>
      <div className="plan-cta">
        <a className="commerce-button" href="/register">
          عضویت رایگان
        </a>
        <a className="plan-link" href="/income-plan">
          جزئیات کامل طرح درآمد
        </a>
      </div>
    </section>,
  ];

  const total = slides.length;
  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(total - 1, i))), [total]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // Right-to-left deck: the left arrow moves forward.
      if (e.key === "ArrowLeft" || e.key === "PageDown" || e.key === " ") go(index + (locale === "en" ? -1 : 1));
      if (e.key === "ArrowRight" || e.key === "PageUp") go(index + (locale === "en" ? 1 : -1));
      if (e.key === "Home") go(0);
      if (e.key === "End") go(total - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go, index, locale, total]);

  return (
    <Localized>
      <div
        className="plan-deck"
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 50) go(index + ((dx > 0) === (locale !== "en") ? 1 : -1));
        }}
      >
        <div className="plan-progress" aria-hidden="true">
          <span style={{ width: ((index + 1) / total) * 100 + "%" }} />
        </div>
        <div className="plan-stage" aria-live="polite">
          {slides[index]}
        </div>
        <nav className="plan-nav" aria-label="اسلایدهای ارائه">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0}>
            قبلی
          </button>
          <div className="plan-dots">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={"اسلاید " + n(i + 1)}
                aria-current={i === index ? "step" : undefined}
                onClick={() => go(i)}
              />
            ))}
          </div>
          <span className="plan-count">
            {n(index + 1)} / {n(total)}
          </span>
          <button type="button" className="primary" onClick={() => go(index + 1)} disabled={index === total - 1}>
            بعدی
          </button>
        </nav>
      </div>
    </Localized>
  );
}
