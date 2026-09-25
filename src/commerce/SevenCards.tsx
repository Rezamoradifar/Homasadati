"use client";
import Localized from "../i18n/Localized";
import { useSiteLocale } from "../i18n/SiteLocale";
import { sevenCards } from "../platform/seven-card-model";

export default function SevenCards() {
  const { locale } = useSiteLocale();
  const n = (value: number) =>
    value.toLocaleString(locale === "en" ? "en-US" : "fa-IR");
  return (
    <Localized>
      <section className="brand-chapter">
        <h2>طرح هشت‌کارتی باشگاه</h2>
        <p>مبالغ این جدول به تومان است. سقف پاداش، درآمد تضمین‌شده نیست.</p>
        <div style={{ overflowX: "auto" }}>
          <table className="portal-table">
            <caption>بازه خرید، جایگاه‌ها و سقف هفتگی</caption>
            <thead>
              <tr>
                <th>کارت</th>
                <th>حداقل خرید</th>
                <th>کمتر از</th>
                <th>میز کار فعال</th>
                <th>سقف هفتگی</th>
              </tr>
            </thead>
            <tbody>
              {sevenCards.map((card) => (
                <tr key={card.level}>
                  <td>{locale === "en" ? card.english : card.name}</td>
                  <td>{n(card.minToman)}</td>
                  <td>
                    {card.maxExclusiveToman ? n(card.maxExclusiveToman) : "—"}
                  </td>
                  <td>{n(card.desks)}</td>
                  <td>{n(card.weeklyCapToman)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          در مرز بازه‌ها، مبلغ خرید در کارت بالاتر قرار می‌گیرد؛ برای مثال خرید
          ۲۰ میلیون تومان در بازه سرو است.
        </p>
        <ul>
          <li>
            تعادل ۳۰ میلیون تومان در هر سمت، یک پاداش ۵٫۴ میلیون تومانی ایجاد
            می‌کند.
          </li>
          <li>
            از هر هشت تعادل، هفت پاداش نقدی و پاداش هشتم به‌طور کامل ووچر خرید
            است.
          </li>
          <li>حجم استفاده‌نشده برای تعادل‌های بعدی باقی می‌ماند.</li>
          <li>خرید شخصی در حجم پورسانت جایگاه اول خود فرد محاسبه نمی‌شود.</li>
          <li>
            خرید اولیه و یکجای سیمرغ مشمول ۶ میلیون تومان بازگشت وجه است؛ خرید
            مرحله‌ای مشمول نیست.
          </li>
        </ul>
      </section>
    </Localized>
  );
}
