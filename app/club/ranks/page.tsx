import { CommerceShell } from "../../../src/commerce/Shell";
import { travelPresets } from "../../../src/platform/travel-presets";
export const metadata = { title: "هفت رتبه باشگاه و کارت سفر | همای سعادت" };
export default function RanksPage() {
  const ranks = travelPresets();
  const number = (n: number) => n.toLocaleString("fa-IR");
  return (
    <CommerceShell>
      <main id="commerce-main" className="rank-page">
        <header>
          <p className="commerce-eyebrow">HOMA PRIVILEGE / SEVEN CHAPTERS</p>
          <h1>هفت رتبه؛ یک مسیر همراهی</h1>
          <p>
            از جوانه تا سیمرغ؛ کارت سفر شخصی با هویت ایرانی. اعتبار سفر غیرنقدی
            است و با موجودی کیف پول تفاوت دارد.
          </p>
          <p className="rank-disclosure">
            کارت‌های «پیشنهادی» هنوز مزیت فعال یا وعده اعتبار نیستند. تنها
            رتبه‌ای که مدیریت قانون صدور آن را فعال کرده باشد، با احراز شرایط
            قابل صدور است.
          </p>
        </header>
        <div className="rank-grid">
          {ranks.map((r) => (
            <article className={"rank-card rank-" + r.tone} key={r.level}>
              <div className="rank-art">
                <span>HOMA PRIVILEGE</span>
                <img src="/assets/brand-mark.png" alt="" />
                <small>{number(r.level).padStart(2, "۰")} / ۰۷</small>
                <h2>{r.display_name}</h2>
                <p>کارت به نام عضو واجد شرایط</p>
              </div>
              <div className="rank-description">
                <strong>
                  {r.active ? "صدور فعال" : "پیشنهاد؛ صدور غیرفعال"}
                </strong>
                <dl>
                  <dt>حداقل فروش شخصی تجمعی</dt>
                  <dd>{number(r.threshold)} تومان</dd>
                  {r.group_threshold > 0 && (
                    <>
                      <dt>حداقل فروش گروهی تجمعی</dt>
                      <dd>{number(r.group_threshold)} تومان</dd>
                    </>
                  )}
                  <dt>{r.active ? "اعتبار کارت" : "اعتبار پیشنهادی کارت"}</dt>
                  <dd>{number(r.amount)} تومان</dd>
                  <dt>مدت اعتبار پس از صدور</dt>
                  <dd>{number(r.duration)} روز</dd>
                </dl>
              </div>
            </article>
          ))}
        </div>
        <section>
          <h2>چطور از کارت استفاده کنیم؟</h2>
          <ol>
            <li>
              عضویت در باشگاه و خرید پرداخت‌شده واجد شرایط از هما تمدن، با پایان
              مهلت لغو.
            </li>
            <li>
              احراز رتبه طبق فروش واقعی ثبت‌شده؛ یک کارت برای هر رتبه فعال.
            </li>
            <li>ثبت درخواست سفر حداقل هفت روز کاری کامل پیش از تاریخ حرکت.</li>
            <li>
              هماهنگی ظرفیت و مابه‌التفاوت با کارگزار؛ مصرف اعتبار فقط پس از
              تأیید نهایی.
            </li>
          </ol>
          <a className="commerce-button gold" href="/account?tab=travel-cards">
            کارت‌های سفر من
          </a>
        </section>
      </main>
    </CommerceShell>
  );
}
