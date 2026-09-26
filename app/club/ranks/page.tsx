import {Money,UsdNote} from '../../../src/commerce/currency';
import SevenCardPublic from "../../../src/platform/SevenCardPublic";
import { translatedMetadata } from "../../../src/i18n/server";

import Localized from "../../../src/i18n/Localized";
import PrivilegeCard from "../../PrivilegeCard";
import { CommerceShell } from "../../../src/commerce/Shell";
import { travelPresets } from "../../../src/platform/travel-presets";
import { sevenCards } from "../../../src/platform/seven-card-model";
export async function generateMetadata() { return translatedMetadata({ title: "هشت رتبه باشگاه و کارت سفر | هما نت" }); }
export default function RanksPage() {
  const ranks = travelPresets();
  // Travel credit shows only once staff have switched at least one rank on;
  // until then the page shows the plan's cards alone, with no draft figures.
  const travel = ranks.some((r) => r.active);
  const number = (n: number) => n.toLocaleString("fa-IR");
  return (
    <Localized><CommerceShell>
      <main id="commerce-main" className="rank-page">
        <header>
          <p className="commerce-eyebrow">باشگاه همای / هشت رتبه</p>
          <h1>هشت رتبه؛ یک مسیر همراهی</h1>
          {travel ? (
            <>
              <p>
                از جوانه تا آریا؛ کارت سفر شخصی با هویت ایرانی. اعتبار سفر غیرنقدی
                است و با موجودی کیف پول تفاوت دارد.
              </p>
              <p>کارت سفر تابع مقررات جداگانه است؛ جدول طرح هشت کارت در ادامه آمده است.</p>
            </>
          ) : (
            <p>
              از جوانه تا آریا؛ کارت‌های باشگاه مشتریان هما نت با هویت ایرانی. حداقل
              خرید، میز کار و سقف پاداش هر کارت در جدول زیر آمده است.
            </p>
          )}
        </header>
        <SevenCardPublic />
        {travel ? (
          <>
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
          </>
        ) : (
          <>
            <UsdNote />
            <div className="rank-grid">
              {sevenCards.map((c) => (
                <Localized key={c.level}>
                  <article className={"rank-card rank-" + c.tone} id={"rank-" + c.level}>
                    <PrivilegeCard name={c.name} tone={c.tone} level={c.level} />
                  </article>
                </Localized>
              ))}
            </div>
          </>
        )}
      </main>
    </CommerceShell></Localized>
  );
}
