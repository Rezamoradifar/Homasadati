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
        <h2>پلن هفت کارت</h2>
        <DataState state={state}>
          {(data) => (
            <Localized>
              <>
                <p role="status">
                  این پلن در مرحله آماده‌سازی است؛ پرداخت، فعال‌سازی جایگاه و
                  صدور ووچر بر اساس آن هنوز فعال نشده است.
                </p>
                <SevenCards />
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
