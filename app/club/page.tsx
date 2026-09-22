import { translatedMetadata } from "../../src/i18n/server";
import { CommerceShell } from "../../src/commerce/Shell";
import Localized from "../../src/i18n/Localized";
import { loyaltyPolicy } from "../../src/platform/loyalty-engine";
import { all } from "../../src/platform/schema";
import "../../src/platform/panel.css";
export const dynamic = "force-dynamic";
export async function generateMetadata() { return translatedMetadata({ title: "باشگاه مشتریان | هما نت" }); }
export default function ClubPage() {
  const policy = loyaltyPolicy(),
    levels = all(
      "SELECT name,threshold,benefits FROM p_loyalty_levels WHERE active=1 ORDER BY threshold LIMIT 100",
    ),
    rewards = all(
      "SELECT title,description,points,stock FROM p_rewards WHERE active=1 ORDER BY points,id LIMIT 100",
    );
  return (
    <CommerceShell>
      <Localized>
        <main id="commerce-main" className="portal">
          <div className="portal-main">
            <header className="portal-card">
              <p>هما نت · باشگاه مشتریان</p>
              <h1>از هر همراهی، فرصتی برای تجربه‌ای تازه</h1>
              <p>
                امتیاز خرید، مزایای فعال و سطح باشگاه خود را در یک حساب دنبال
                کنید.
              </p>
              <div className="portal-row">
                <a
                  className="portal-button primary"
                  href="/account?tab=loyalty"
                >
                  امتیازات و مزایای من
                </a>
                <a className="portal-button" href="/register">
                  عضویت در باشگاه
                </a>
                <a className="portal-button" href="/merchants">
                  پذیرندگان
                </a>
              </div>
            </header>
            <section className="portal-card">
              <h2>چطور امتیاز می‌گیرید؟</h2>
              {policy.enabled ? (
                <>
                  <p>
                    {`برای هر ${policy.spendUnit.toLocaleString("fa-IR")} تومان خرید، ${policy.pointsPerUnit.toLocaleString("fa-IR")} امتیاز به شما تعلق می‌گیرد.`}
                    {" "}
                    امتیاز هر سفارش به عدد صحیح پایین‌تر گرد می‌شود و پس از پایان مهلت لغو آزاد می‌شود.
                  </p>
                  <p>
                    {policy.expiryDays
                      ? `اعتبار امتیاز از زمان آزادسازی: ${policy.expiryDays.toLocaleString("fa-IR")} روز.`
                      : "امتیاز این برنامه تاریخ انقضا ندارد."}
                  </p>
                </>
              ) : (
                <p>
                  برنامه امتیاز خودکار خرید هنوز فعال نشده است. امتیازهای
                  ثبت‌شده و مزایای موجود از پنل حساب قابل پیگیری‌اند.
                </p>
              )}
              <p>
                امتیاز برای استفاده از مزایای باشگاه است و قابل برداشت نقدی
                نیست. شرایط هر خرید هنگام ثبت سفارش حفظ می‌شود؛ مرجوعی سفارش،
                امتیاز آن را نیز اصلاح می‌کند.
              </p>
            </section>
            <section className="portal-card">
              <h2>سطوح باشگاه</h2>
              <p>
                سطح امتیازی بر پایه امتیاز خریدهای غیرمرجوع است و با رتبه شبکه و
                کارت سفر تفاوت دارد.
              </p>
              <div className="merchant-grid">
                {levels.map((l) => (
                  <article className="portal-card" key={l.threshold}>
                    <h3 translate="no">{l.name}</h3>
                    <p>
                      <span>حداقل امتیاز خرید</span>:{" "}
                      {l.threshold.toLocaleString("fa-IR")}
                    </p>
                    <p translate="no">{l.benefits}</p>
                  </article>
                ))}
              </div>
              {!levels.length && (
                <p>
                  سطوح باشگاه پس از فعال‌سازی در این بخش نمایش داده می‌شوند.
                </p>
              )}
            </section>
            <section className="portal-card">
              <h2>مزایای فعال</h2>
              <div className="merchant-grid">
                {rewards.map((r, i) => (
                  <article className="portal-card" key={i}>
                    <h3 translate="no">{r.title}</h3>
                    <p translate="no">{r.description}</p>
                    <p>{r.points.toLocaleString("fa-IR")} امتیاز</p>
                    <p>
                      {r.stock > 0
                        ? "قابل درخواست از حساب کاربری"
                        : "ظرفیت تکمیل شده"}
                    </p>
                  </article>
                ))}
              </div>
              {!rewards.length && <p>مزیت فعالی برای درخواست ثبت نشده است.</p>}
            </section>
            <div className="portal-row">
              <a className="portal-button" href="/club/ranks">
                رتبه‌ها و کارت سفر
              </a>
              <a className="portal-button" href="/account?tab=binary">
                شبکه باینری من
              </a>
              <a className="portal-button" href="/shop">
                فروشگاه
              </a>
            </div>
          </div>
        </main>
      </Localized>
    </CommerceShell>
  );
}
