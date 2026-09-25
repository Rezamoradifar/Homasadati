import {Money,UsdNote} from '../../../src/commerce/currency';
import SevenCardPublic from "../../../src/platform/SevenCardPublic";
import { translatedMetadata } from "../../../src/i18n/server";

import Localized from "../../../src/i18n/Localized";
import PrivilegeCard from "../../PrivilegeCard";
import { CommerceShell } from "../../../src/commerce/Shell";
import { travelPresets } from "../../../src/platform/travel-presets";
export async function generateMetadata() { return translatedMetadata({ title: "هشت رتبه باشگاه و کارت سفر | هما نت" }); }
export default function RanksPage() {
  const ranks = travelPresets();
  const number = (n: number) => n.toLocaleString("fa-IR");
  return (
    <Localized><CommerceShell>
      <main id="commerce-main" className="rank-page">
        <header>
          <p className="commerce-eyebrow">باشگاه همای / هشت رتبه</p>
          <h1>هشت رتبه؛ یک مسیر همراهی</h1>
          <p>
            از جوانه تا سیمرغ؛ کارت سفر شخصی با هویت ایرانی. اعتبار سفر غیرنقدی
            است و با موجودی کیف پول تفاوت دارد.
          </p>
          <p>کارت سفر تابع مقررات جداگانه است؛ جدول پلن جدید در ادامه آمده است.</p><p className="rank-disclosure">
            کارت‌های «پیشنهادی» هنوز مزیت فعال یا وعده اعتبار نیستند. تنها
            رتبه‌ای که مدیریت قانون صدور آن را فعال کرده باشد، با احراز شرایط
            قابل صدور است.
          </p>
        </header>
        <SevenCardPublic />
        <section className="rank-comparison" aria-labelledby="compare-title"><h2 id="compare-title">مقایسهٔ هشت کارت</h2><p>اعتبار سفر با سقف پاداش هفتگی پلن جدید متفاوت است.</p><div className="comparison-scroll" role="region" aria-label="جدول مقایسه کارت‌ها" tabIndex={0}><table><thead><tr><th scope="col">کارت</th><th scope="col">اعتبار سفر</th><th scope="col">حداقل فروش شخصی</th><th scope="col">اعتبار (روز)</th><th scope="col">وضعیت صدور</th></tr></thead><tbody>{ranks.map(r=><Localized key={r.level}><tr><th scope="row"><a href={"#rank-"+r.level}>{r.display_name}</a></th><td><Money toman={r.amount}/></td><td><Money toman={r.threshold}/></td><td>{number(r.duration)}</td><td>{r.active?"صدور فعال":"پیشنهاد؛ صدور غیرفعال"}</td></tr></Localized>)}</tbody></table></div><p>خرید کارت به‌تنهایی رتبه ایجاد نمی‌کند؛ شرایط فروش شخصی و گروهی و خرید واجد شرایط هر رتبه ملاک است.</p></section>
        <UsdNote/>
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
                showPurchaseMinimum={false}
              />
              <div className="rank-description">
                <strong>
                  {r.active ? "صدور فعال" : "پیشنهاد؛ صدور غیرفعال"}
                </strong>
                <dl>
                  <dt>حداقل فروش شخصی تجمعی</dt>
                  <dd><Money toman={r.threshold}/></dd>
                  {r.group_threshold > 0 && (
                    <>
                      <dt>حداقل فروش گروهی تجمعی</dt>
                      <dd><Money toman={r.group_threshold}/></dd>
                    </>
                  )}
                  <dt>{r.active ? "اعتبار کارت" : "اعتبار پیشنهادی کارت"}</dt>
                  <dd><Money toman={r.amount}/></dd>
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
              عضویت در باشگاه و خرید پرداخت‌شده واجد شرایط از همای تمدن، با پایان
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
