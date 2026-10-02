"use client";
import { useState } from "react";
import Localized from "../i18n/Localized";
import SevenCards from "../commerce/SevenCards";
import { api, RecordData, amount } from "./client";
import { DataState, Form, useData, Field } from "./Widgets";
const pending: [string, string] = ["", "تعیین نشده"];
const fields: Field[] = [
  {
    name: "overflow",
    label: "عبور از سقف هفتگی",
    type: "select",
    required: false,
    options: [
      pending,
      ["carry-whole", "انتقال تعادل کامل به هفته بعد"],
      ["split-reward", "تقسیم پاداش بین هفته‌ها"],
    ],
  },
  {
    name: "counterScope",
    label: "شمارنده پاداش هشتم",
    type: "select",
    required: false,
    options: [pending, ["desk", "برای هر جایگاه"], ["member", "برای هر عضو"]],
  },
  {
    name: "voucherCountsTowardCap",
    label: "ووچر در سقف هفتگی",
    type: "select",
    required: false,
    options: [pending, ["true", "محاسبه شود"], ["false", "محاسبه نشود"]],
  },
  {
    name: "topology",
    label: "چیدمان جایگاه‌های خود فرد",
    type: "select",
    required: false,
    options: [
      pending,
      ["own-desks", "زیر میز اول خود فرد؛ میزها به‌ترتیب پر می‌شوند"],
      ["left-chain", "زنجیره در سمت چپ"],
      ["right-chain", "زنجیره در سمت راست"],
      ["manual", "چیدمان دستی"],
    ],
  },
  {
    name: "purchaseCredit",
    label: "ماهیت بن‌کارت خرید اولیه",
    type: "select",
    required: false,
    options: [
      pending,
      ["purchase-value", "معادل ارزش خرید"],
      ["additional-credit", "اعتبار اضافه بر خرید"],
    ],
  },
  {
    name: "weekStart",
    label: "شروع هفته به وقت تهران",
    type: "select",
    required: false,
    options: [
      pending,
      ["6", "شنبه"],
      ["0", "یکشنبه"],
      ["1", "دوشنبه"],
      ["2", "سه‌شنبه"],
      ["3", "چهارشنبه"],
      ["4", "پنجشنبه"],
      ["5", "جمعه"],
    ],
  },
  { name: "reason", label: "دلیل تغییر", required: true },
];
function DecisionForm({
  data,
  changed,
}: {
  data: RecordData;
  changed: () => void;
}) {
  const initial = Object.fromEntries(
    Object.entries(data.decisions).map(([k, v]) => [
      k,
      v === null ? "" : String(v),
    ]),
  );
  return (
    <Form
      key={data.revision}
      fields={fields}
      initial={initial}
      onSubmit={async (values) => {
        const decisions: RecordData = {};
        for (const key of Object.keys(data.decisions))
          decisions[key] =
            values[key] === ""
              ? null
              : key === "voucherCountsTowardCap"
                ? values[key] === "true"
                : key === "weekStart"
                  ? Number(values[key])
                  : values[key];
        await api("admin/seven-card-plan", "POST", {
          decisions,
          revision: data.revision,
          reason: values.reason,
        });
        changed();
      }}
    />
  );
}
function MemberStatus({ status }: { status: RecordData }) {
  return (
    <Localized>
      <div className="portal-card">
        <h3>وضعیت کارت شما</h3>
        <dl>
          <dt>رتبهٔ کارت</dt>
          <dd>{status.level ? String(status.level) : "هنوز فعال نشده"}</dd>
          <dt>تعداد میز</dt>
          <dd>{String(status.desks)}</dd>
          <dt>مجموع خرید محاسبه‌شده</dt>
          <dd>{amount(status.totalPurchase)} تومان</dd>
          <dt>حجم سمت چپ</dt>
          <dd>{amount(status.leftVolume)} تومان</dd>
          <dt>حجم سمت راست</dt>
          <dd>{amount(status.rightVolume)} تومان</dd>
          <dt>موجودی ووچر</dt>
          <dd>{amount(status.voucherBalance)} تومان</dd>
        </dl>
        {status.recent?.length ? (
          <table className="portal-table">
            <thead>
              <tr><th>هفته</th><th>میز</th><th>نوع</th><th>مبلغ</th></tr>
            </thead>
            <tbody>
              {status.recent.map((r: RecordData, i: number) => (
                <Localized key={i}>
                  <tr>
                    <td>{String(r.week).slice(0, 10)}</td>
                    <td>{String(r.desk)}</td>
                    <td>{r.void ? "برگشت‌خورده" : r.kind === "voucher" ? "ووچر" : "نقدی"}</td>
                    <td>{amount(r.amount)}</td>
                  </tr>
                </Localized>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </Localized>
  );
}

function LivePanel({ plan, changed }: { plan: RecordData; changed: () => void }) {
  const [refresh, setRefresh] = useState(0),
    [preview, setPreview] = useState<RecordData | null>(null),
    [error, setError] = useState("");
  const live = useData("admin/seven-card-live", refresh);
  return (
    <Localized>
      <div className="portal-card">
        <h3>فعال‌سازی تسویهٔ واقعی</h3>
        <p>
          با فعال‌سازی، پاداش‌ها هر هفته (شنبه ساعت ۰۰:۰۰ به وقت تهران) واقعاً به
          کیف پول اعضا واریز می‌شود و موتور باینری قدیمی متوقف می‌شود. فقط
          خریدهایی حساب می‌شوند که بعد از فعال‌سازی پرداخت شده‌اند. پیش از
          فعال‌سازی، پیش‌نمایش را بررسی کنید.
        </p>
        {plan.unresolved?.length ? (
          <p role="alert">پیش از فعال‌سازی باید همهٔ تصمیم‌های بالا ثبت شوند.</p>
        ) : null}
        <DataState state={live}>
          {(d) => (
            <Localized>
              <>
                <p role="status">
                  وضعیت فعلی: {d.live ? "فعال" : "غیرفعال"} · بودجهٔ پاداش:{" "}
                  {d.unlimitedBudget ? "بدون سقف (طبق متن طرح)" : amount(d.fundingBps / 100) + "٪ فروش هفته"}
                </p>
                <Form
                  fields={[
                    { name: "live", label: "تسویهٔ واقعی فعال باشد", type: "checkbox" },
                    {
                      name: "unlimitedBudget",
                      label: "بدون سقف بودجه؛ هر تعادل طبق متن طرح پرداخت شود (ریسک پرداخت بیش از فروش با شرکت است)",
                      type: "checkbox",
                    },
                    {
                      name: "fundingBps",
                      label: "سهم بودجهٔ پاداش از فروش هفته (واحد: یک‌دهم‌هزارم؛ ۳۰۰۰ یعنی ۳۰٪)",
                      type: "number",
                      min: 1,
                      max: 10000,
                    },
                    { name: "reason", label: "دلیل فعال‌سازی یا توقف", required: true },
                  ]}
                  initial={{ live: !!d.live, unlimitedBudget: !!d.unlimitedBudget, fundingBps: d.fundingBps || 3000, reason: "" }}
                  submit="ثبت"
                  onSubmit={async (v) => {
                    await api("admin/seven-card-live", "POST", {
                      live: !!v.live,
                      unlimitedBudget: v.live ? !!v.unlimitedBudget : undefined,
                      fundingBps: v.live && !v.unlimitedBudget ? Number(v.fundingBps) : undefined,
                      reason: v.reason,
                    });
                    setRefresh((x) => x + 1);
                    changed();
                  }}
                />
                <button
                  className="portal-button"
                  type="button"
                  onClick={async () => {
                    setError("");
                    setPreview(null);
                    try {
                      setPreview(await api("admin/seven-card-preview"));
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "خطا");
                    }
                  }}
                >
                  پیش‌نمایش تسویهٔ این هفته
                </button>
                {error && <p role="alert">{error}</p>}
                {preview && (
                  <dl aria-live="polite">
                    <dt>فروش محاسبه‌شده</dt>
                    <dd>{amount(preview.sales)} تومان</dd>
                    <dt>بودجهٔ پاداش</dt>
                    <dd>{amount(preview.budget)} تومان</dd>
                    <dt>تعداد تعادل</dt>
                    <dd>{String(preview.matches)}</dd>
                    <dt>پاداش نقدی</dt>
                    <dd>{amount(preview.cash)} تومان</dd>
                    <dt>ووچر</dt>
                    <dd>{amount(preview.voucher)} تومان</dd>
                  </dl>
                )}
                {d.weeks?.length ? (
                  <table className="portal-table">
                    <thead>
                      <tr><th>هفته</th><th>فروش</th><th>تعادل</th><th>نقدی</th><th>ووچر</th></tr>
                    </thead>
                    <tbody>
                      {d.weeks.map((w: RecordData) => (
                        <Localized key={w.week}>
                          <tr>
                            <td>{String(w.week).slice(0, 10)}</td>
                            <td>{amount(w.sales)}</td>
                            <td>{String(w.matches)}</td>
                            <td>{amount(w.cash)}</td>
                            <td>{amount(w.voucher)}</td>
                          </tr>
                        </Localized>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </>
            </Localized>
          )}
        </DataState>
      </div>
    </Localized>
  );
}

export default function SevenCardPanel({ admin = false }: { admin?: boolean }) {
  const [refresh, setRefresh] = useState(0),
    [result, setResult] = useState<RecordData | null>(null);
  const state = useData(
    admin ? "admin/seven-card-plan" : "seven-card-plan",
    refresh,
  );
  return (
    <Localized>
      <section className="portal-card">
        <h2>پلن هشت کارت</h2>
        <DataState state={state}>
          {(data) => (
            <Localized>
              <>
                <p role="status">
                  {data.liveSettlement
                    ? "تسویهٔ هفتگی این پلن فعال است؛ پاداش‌ها هر هفته پس از پایان مهلت لغو خریدها محاسبه می‌شوند."
                    : "این پلن در مرحله آماده‌سازی است؛ پرداخت، فعال‌سازی جایگاه و صدور ووچر بر اساس آن هنوز فعال نشده است."}
                </p>
                {!admin && data.member && <MemberStatus status={data.member} />}
                <SevenCards />
                {admin && <LivePanel plan={data} changed={() => setRefresh((v) => v + 1)} />}
                {admin && (
                  <>
                    <h3>تصمیم‌های اجرایی پلن</h3>
                    <p>
                      ذخیره این تصمیم‌ها فقط پیش‌نویس را ثبت می‌کند و پرداخت
                      واقعی را فعال نمی‌کند.
                    </p>
                    <DecisionForm
                      data={data}
                      changed={() => setRefresh((v) => v + 1)}
                    />
                    <h3>پیش‌نمایش تعادل کامل برای یک جایگاه در یک هفته</h3>
                    <p>
                      این محاسبه تعادل ناقص را پرداخت نمی‌کند و مانده حجم را نگه
                      می‌دارد. هیچ تغییری در کیف پول ایجاد نمی‌شود.
                    </p>
                    <Form
                      fields={[
                        {
                          name: "left",
                          label: "حجم سمت چپ (تومان)",
                          type: "number",
                          min: 0,
                          required: true,
                        },
                        {
                          name: "right",
                          label: "حجم سمت راست (تومان)",
                          type: "number",
                          min: 0,
                          required: true,
                        },
                        {
                          name: "earnedThisWeek",
                          label: "پاداش منظورشده در سقف این هفته (تومان)",
                          type: "number",
                          min: 0,
                          max: 15000000,
                          required: true,
                        },
                        {
                          name: "previousMatches",
                          label: "تعداد تعادل‌های قبلی در شمارنده",
                          type: "number",
                          min: 0,
                          required: true,
                        },
                        {
                          name: "budget",
                          label: "بودجه قابل تخصیص (تومان)",
                          type: "number",
                          min: 0,
                          required: true,
                        },
                        {
                          name: "voucherCountsTowardCap",
                          label: "ووچر در سقف هفتگی محاسبه شود",
                          type: "checkbox",
                        },
                      ]}
                      initial={{
                        left: 90000000,
                        right: 90000000,
                        earnedThisWeek: 0,
                        previousMatches: 0,
                        budget: 15000000,
                        voucherCountsTowardCap: true,
                      }}
                      submit="محاسبه"
                      onSubmit={async (values) => {
                        setResult(null);
                        setResult(
                          await api(
                            "admin/seven-card-simulate",
                            "POST",
                            values,
                          ),
                        );
                      }}
                    />
                    {result && (
                      <Localized>
                        <dl aria-live="polite">
                          <dt>تعداد تعادل قابل پرداخت</dt>
                          <dd>{result.matches}</dd>
                          <dt>پاداش نقدی</dt>
                          <dd>{amount(result.cash)}</dd>
                          <dt>ووچر خرید</dt>
                          <dd>{amount(result.voucher)}</dd>
                          <dt>مانده سمت چپ</dt>
                          <dd>{amount(result.leftCarry)}</dd>
                          <dt>مانده سمت راست</dt>
                          <dd>{amount(result.rightCarry)}</dd>
                        </dl>
                      </Localized>
                    )}
                  </>
                )}
              </>
            </Localized>
          )}
        </DataState>
      </section>
    </Localized>
  );
}
