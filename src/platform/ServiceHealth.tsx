"use client";
import Localized from "../i18n/Localized";
import { useData, DataState } from "./Widgets";
import { date } from "./client";
export default function ServiceHealth({ refresh }: { refresh: number }) {
  const state = useData("admin/readiness", refresh);
  return (
    <Localized>
      <section className="portal-card service-health">
        <h2>آمادگی فروشگاه و سرویس‌ها</h2>
        <DataState state={state}>
          {(d) => (
            <Localized>
              <>
                <p>
                  وجود تنظیمات به معنی تأیید ارسال یا پرداخت واقعی نیست؛ پس از
                  تنظیم، یک آزمون واقعی انجام دهید.
                </p>
                <div className="service-health-grid">
                  {d.services.map(
                    (s: { name: string; configured: boolean }) => (
                      <Localized key={s.name}>
                        <article>
                          <h3>{s.name}</h3>
                          <span
                            className={
                              s.configured ? "health-good" : "health-attention"
                            }
                          >
                            {s.configured
                              ? "تنظیم‌شده؛ نیازمند آزمون واقعی"
                              : "نیازمند تنظیم"}
                          </span>
                        </article>
                      </Localized>
                    ),
                  )}
                  <article>
                    <h3>پردازش سفارش‌ها و اعلان‌ها</h3>
                    <strong>
                      {d.worker.healthy ? "فعال" : "نیازمند بررسی"}
                    </strong>
                    <p>{date(d.worker.lastSuccess)}</p>
                  </article>
                  <article>
                    <h3>پشتیبان‌گیری روزانه</h3>
                    <strong>
                      {d.backup.healthy ? "نسخه تازه ثبت شده" : "نیازمند بررسی"}
                    </strong>
                    <p>{date(d.backup.lastSuccess)}</p>
                  </article>
                  <article>
                    <h3>پشتیبان خارج از سرور</h3>
                    <strong>
                      {d.offsite.healthy
                        ? "نسخه تازه ثبت شده"
                        : "نیازمند بررسی"}
                    </strong>
                    <p>{date(d.offsite.lastSuccess)}</p>
                  </article>
                  <article>
                    <h3>پایش و هشدار</h3>
                    <strong>
                      {d.monitoring.configured
                        ? "تنظیم‌شده؛ نیازمند آزمون واقعی"
                        : "نیازمند تنظیم"}
                    </strong>
                    <p>{date(d.monitoring.lastAlert)}</p>
                  </article>
                  <article>
                    <h3>پردازش دوره‌ای باینری</h3>
                    <p>{date(d.binaryCycle.lastSuccess)}</p>
                  </article>
                </div>
                <dl className="readiness-tasks">
                  <dt>سفارش پرداخت‌شده در انتظار تکمیل</dt>
                  <dd>{d.pendingOrders}</dd>
                  <dt>محصول منتشرنشده</dt>
                  <dd>{d.unpublished}</dd>
                  <dt>محصول با ترجمه ناقص</dt>
                  <dd>{d.missingTranslations}</dd>
                  <dt>درخواست در انتظار پشتیبانی</dt>
                  <dd>{d.openTickets}</dd>
                  <dt>تسویه پذیرنده در انتظار تأیید دوم</dt>
                  <dd>{d.pendingMerchantReviews}</dd>
                  <dt>اعلان ناموفق پس از چند تلاش</dt>
                  <dd>{d.failedNotifications}</dd>
                </dl>
                <details>
                  <summary>خطاهای اخیر سرویس‌ها</summary>
                  {d.events.length ? (
                    <ul>
                      {d.events.map(
                        (
                          e: { area: string; code: string; created_at: string },
                          i: number,
                        ) => (
                          <li key={i}>
                            <code>
                              {e.area} · {e.code}
                            </code>
                            <time>{date(e.created_at)}</time>
                          </li>
                        ),
                      )}
                    </ul>
                  ) : (
                    <p>خطایی ثبت نشده است.</p>
                  )}
                </details>
              </>
            </Localized>
          )}
        </DataState>
      </section>
    </Localized>
  );
}
