import {tomanToRial,tierPriceRial} from '../../../src/commerce/club-tiers';

import Localized from "../../../src/i18n/Localized";
import PrivilegeCard from "../../PrivilegeCard";
import { CommerceShell } from "../../../src/commerce/Shell";
import { travelPresets } from "../../../src/platform/travel-presets";
export const metadata = { title: "هفت رتبه باشگاه و کارت سفر | همای سعادت" };
export default function RanksPage() {
  const ranks = travelPresets();
  const number = (n: number) => n.toLocaleString("fa-IR");
  return (
    <Localized><CommerceShell>
      <main id="commerce-main" className="rank-page">
        <header>
          <p className="commerce-eyebrow">HOMA PRIVILEGE / SEVEN CHAPTERS</p>
          <h1>هفت رتبه؛ یک مسیر همراهی</h1>
          <p>
            از جوانه تا سیمرغ؛ کارت سفر شخصی با هویت ایرانی. اعتبار سفر غیرنقدی
            است و با موجودی کیف پول تفاوت دارد.
          </p>
          <p>قیمت‌های روی کارت، پیشنهاد عضویت به ریال هستند؛ خرید مستقیم کارت هنوز فعال نیست. اعتبار سفر و شرایط احراز هر رتبه را در جزئیات باشگاه ببینید.</p><p className="rank-disclosure">
            کارت‌های «پیشنهادی» هنوز مزیت فعال یا وعده اعتبار نیستند. تنها
            رتبه‌ای که مدیریت قانون صدور آن را فعال کرده باشد، با احراز شرایط
            قابل صدور است.
          </p>
        </header>
        <section className="rank-comparison" aria-labelledby="compare-title"><h2 id="compare-title">مقایسه هفت کارت</h2><p>قیمت پیشنهادی عضویت با اعتبار غیرنقدی سفر تفاوت دارد. مبلغ قابل استفاده و صدور فعال را جداگانه بررسی کنید.</p><div className="comparison-scroll" role="region" aria-label="جدول مقایسه کارت‌ها" tabIndex={0}><table><thead><tr><th scope="col">کارت</th><th scope="col">قیمت پیشنهادی (ریال)</th><th scope="col">اعتبار سفر (ریال)</th><th scope="col">حداقل فروش شخصی (ریال)</th><th scope="col">اعتبار (روز)</th><th scope="col">وضعیت صدور</th></tr></thead><tbody>{ranks.map(r=><Localized key={r.level}><tr><th scope="row"><a href={"#rank-"+r.level}>{r.display_name}</a></th><td>{number(tierPriceRial(r.level)||0)}</td><td>{number(tomanToRial(r.amount))}</td><td>{number(tomanToRial(r.threshold))}</td><td>{number(r.duration)}</td><td>{r.active?"صدور فعال":"پیشنهاد؛ صدور غیرفعال"}</td></tr></Localized>)}</tbody></table></div><p>خرید کارت به‌تنهایی رتبه ایجاد نمی‌کند؛ شرایط فروش شخصی و گروهی و خرید واجد شرایط هر رتبه ملاک است.</p></section>
        <div className="rank-grid">
          {ranks.map((r) => (
            <Localized key={r.level}><article
              className={"rank-card rank-" + r.tone}
              id={"rank-" + r.level}
            >
              <PrivilegeCard
                name={r.display_name}
                tone={r.tone}
                level={r.level}
              />
              <div className="rank-description">
                <strong>
                  {r.active ? "صدور فعال" : "پیشنهاد؛ صدور غیرفعال"}
                </strong>
                <dl>
                  <dt>حداقل فروش شخصی تجمعی</dt>
                  <dd>{number(tomanToRial(r.threshold))} ریال</dd>
                  {r.group_threshold > 0 && (
                    <>
                      <dt>حداقل فروش گروهی تجمعی</dt>
                      <dd>{number(tomanToRial(r.group_threshold))} ریال</dd>
                    </>
                  )}
                  <dt>{r.active ? "اعتبار کارت" : "اعتبار پیشنهادی کارت"}</dt>
                  <dd>{number(tomanToRial(r.amount))} ریال</dd>
                  <dt>مدت اعتبار پس از صدور</dt>
                  <dd>{number(r.duration)} روز</dd>
                </dl>
              </div>
            </article></Localized>
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
    </CommerceShell></Localized>
  );
}
