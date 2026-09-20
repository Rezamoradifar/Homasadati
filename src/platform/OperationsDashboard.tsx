"use client";
import { useState } from "react";
import { amount, labels, RecordData } from "./client";
import { DataState, Filter, Stat, Table, useData } from "./Widgets";
export function OperationsDashboard({
  refresh,
  vertical = "",
}: {
  refresh: number;
  vertical?: string;
}) {
  const [query, setQuery] = useState("");
  const state = useData(
    `admin/operations?${query}&vertical=${vertical}`,
    refresh,
  );
  return (
    <>
      <div className="portal-command-banner">
        <small>HOMAY SAADAT / BUSINESS OPERATIONS</small>
        <h2>
          {vertical ? `مرکز مدیریت ${labels[vertical]}` : "نمای جامع کسب‌وکار"}
        </h2>
        <p>
          فروش، ظرفیت، سفارش‌های نیازمند اقدام و وضعیت انتشار؛ از اطلاعات
          ثبت‌شده مجموعه شما.
        </p>
        <a className="portal-button" href="/admin?tab=products">
          مدیریت محصولات و ظرفیت
        </a>
      </div>
      <Filter dates onChange={setQuery} />
      <DataState state={state}>
        {(d) => (
          <>
            <div className="portal-stats">
              <Stat label="فروش خالص سفارش‌های بازه" value={d.sales.revenue} />
              <Stat
                label="سفارش پرداخت‌شده"
                value={d.sales.paidOrders}
                unit="سفارش"
              />
              <Stat label="میانگین ارزش سفارش" value={d.averageOrder} />
              <Stat
                label="مبلغ برگشتی سفارش‌های بازه"
                value={d.sales.refunds}
              />
            </div>
            <div className="portal-stats">
              <Stat
                label="کل محصولات / پلن‌ها"
                value={d.catalog.products}
                unit="مورد"
              />
              <Stat label="منتشرشده" value={d.catalog.published} unit="مورد" />
              <Stat label="ناموجود" value={d.catalog.outOfStock} unit="مورد" />
              <Stat
                label="رو به اتمام"
                value={d.catalog.lowStock}
                unit="مورد"
              />
            </div>
            <p className="portal-notice">
              کارت‌های فروش بر اساس تاریخ ایجاد سفارش‌اند؛ نمودار و پرفروش‌ها بر
              اساس تاریخ پرداخت (UTC). موجودی، صف اجرا و اشتراک‌ها وضعیت فعلی را
              نشان می‌دهند.
            </p>
            <div className="portal-business-grid">
              <section className="portal-card">
                <h2>روند فروش پرداخت‌شده</h2>
                {d.trend.length ? (
                  <>
                    <div
                      className="portal-chart"
                      role="img"
                      aria-label="نمودار فروش روزانه، داده دقیق در جدول زیر"
                    >
                      {d.trend.map((r: RecordData) => (
                        <div
                          key={r.day}
                          title={`${r.day}: ${amount(r.sales)} تومان`}
                        >
                          <span
                            style={{
                              height: `${(r.sales / Math.max(1, ...d.trend.map((x: RecordData) => x.sales))) * 100}%`,
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <Table
                      rows={d.trend}
                      columns={[
                        ["day", "روز"],
                        ["sales", "فروش", "money"],
                      ]}
                    />
                  </>
                ) : (
                  <p className="portal-empty">
                    در این بازه فروش پرداخت‌شده ثبت نشده است.
                  </p>
                )}
              </section>
              <section className="portal-card">
                <h2>گردش سفارش‌ها</h2>
                <div className="portal-stats">
                  <Stat
                    label="منتظر پرداخت"
                    value={d.sales.pending}
                    unit="سفارش"
                  />
                  <Stat
                    label="در حال آماده‌سازی"
                    value={d.sales.processing}
                    unit="سفارش"
                  />
                  <Stat
                    label="ارسال‌شده"
                    value={d.sales.shipped}
                    unit="سفارش"
                  />
                  <Stat
                    label="تحویل‌شده"
                    value={d.sales.delivered}
                    unit="سفارش"
                  />
                </div>
                <a href="/admin?tab=orders" className="portal-button">
                  رسیدگی به سفارش‌ها
                </a>
              </section>
            </div>
            {d.subscriptions && (
              <section className="portal-card">
                <h2>اشتراک‌های هوش مصنوعی</h2>
                <div className="portal-stats">
                  <Stat
                    label="اشتراک فعال"
                    value={d.subscriptions.active}
                    unit="اشتراک"
                  />
                  <Stat
                    label="پایان اعتبار تا ۷ روز آینده"
                    value={d.subscriptions.expiring}
                    unit="اشتراک"
                  />
                </div>
              </section>
            )}
            <section className="portal-card">
              <h2>۱۰ محصول پرفروش بازه</h2>
              <Table
                rows={d.top}
                columns={[
                  ["title", "محصول"],
                  ["orders", "سفارش", "money"],
                  ["units", "تعداد فروخته‌شده", "money"],
                  ["revenue", "فروش خالص", "money"],
                ]}
              />
            </section>
            <section className="portal-card">
              <h2>هشدار انبار و ظرفیت</h2>
              <p>
                حداکثر ۵۰ مورد با کمترین موجودی؛ آستانه هر محصول در فرم آن تنظیم
                می‌شود.
              </p>
              <Table
                rows={d.inventory}
                columns={[
                  ["title", "محصول"],
                  ["sku", "SKU"],
                  ["vertical", "حوزه"],
                  ["stock", "موجودی", "money"],
                  ["threshold", "آستانه", "money"],
                ]}
              />
            </section>
            <section className="portal-card">
              <h2>قدیمی‌ترین سفارش‌های باز</h2>
              <p>حداکثر ۳۰ سفارش نیازمند تکمیل.</p>
              <Table
                rows={d.queue}
                columns={[
                  ["title", "سفارش"],
                  ["status", "وضعیت"],
                  ["amount", "مبلغ", "money"],
                  ["created_at", "ثبت", "date"],
                ]}
              />
            </section>
          </>
        )}
      </DataState>
    </>
  );
}
