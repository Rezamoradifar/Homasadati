"use client";
import Localized from "../i18n/Localized";
import { useSiteLocale } from "../i18n/SiteLocale";
import { sevenLevelCards } from "../platform/card-levels";

export default function SevenCards({cards=sevenLevelCards}:{cards?:typeof sevenLevelCards}) {
  const { locale } = useSiteLocale();
  const n = (value: number) =>
    value.toLocaleString(locale === "en" ? "en-US" : "fa-IR");
  return (
    <Localized>
      <section className="brand-chapter">
        <h2>طرح کارت‌های باشگاه</h2>
        <p>مبالغ این جدول به ریال است. سقف پاداش، درآمد تضمین‌شده نیست.</p>
        <div style={{ overflowX: "auto" }}>
          <table className="portal-table">
            <caption>بازه خرید، جایگاه‌ها و سقف هفتگی</caption>
            <thead>
              <tr>
                <th>کارت</th>
                <th>حداقل خرید</th>
                <th>کمتر از</th>
                <th>جایگاه فعال</th><th>حداکثر شاخه</th>
                <th>سقف هفتگی</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr key={card.level}>
                  <td>{locale === "en" ? card.english : card.name}</td>
                  <td>{n(card.minToman * 10)}</td>
                  <td>
                    {card.maxExclusiveToman ? n(card.maxExclusiveToman * 10) : "—"}
                  </td>
                  <td>{n(card.desks)}</td><td>{n(card.branches)}</td>
                  <td>{n(card.weeklyCapToman * 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          در مرز بازه‌ها، مبلغ خرید در کارت بالاتر قرار می‌گیرد؛ برای مثال خرید
          ۲۰۰ میلیون ریال در بازه سرو است.
        </p>
        <p>هر کاربر ۷ جایگاه ثابت دارد. با هر ۱۰۰ میلیون ریال خرید تجمعی واجد شرایط، جایگاه بعدی روشن می‌شود؛ در ۷۰۰ میلیون ریال هر ۷ جایگاه روشن است و خرید بیشتر جایگاه تازه‌ای ایجاد نمی‌کند.</p>
        <ul>
          <li>
            تعادل ۳۰۰ میلیون ریال در هر سمت، یک پاداش ۴۹ میلیون ریالی ایجاد
            می‌کند.
          </li>
          <li>
            از هر هشت تعادل، هفت پاداش نقدی و پاداش هشتم به‌طور کامل ووچر خرید
            است.
          </li>
          <li>حجم استفاده‌نشده برای تعادل‌های بعدی باقی می‌ماند.</li>
          <li>خرید شخصی، جایگاه‌ها را فعال می‌کند ولی برای هیچ‌کدام از جایگاه‌های خود خریدار حجم پورسانت ایجاد نمی‌کند.</li>
          <li>
            خرید اولیه و یکجای سیمرغ مشمول ۶۰ میلیون ریال بازگشت وجه است؛ خرید
            مرحله‌ای مشمول نیست.
          </li>
        </ul>
      </section>
    </Localized>
  );
}
