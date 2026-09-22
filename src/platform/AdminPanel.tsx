"use client";

import { useSiteLocale } from "../i18n/SiteLocale";
import ServiceHealth from "./ServiceHealth";
import Localized from "../i18n/Localized";
import { extendedCatalogFields } from "./catalog-fields";
import { emptyCatalogDetails } from "./catalog-model";
import { useState } from "react";
import { api, amount, date, labels, RecordData } from "./client";
import {
  DataState,
  DownloadButton,
  Field,
  Filter,
  Form,
  Listing,
  Modal,
  Notice,
  Stat,
  Table,
  useData,
} from "./Widgets";
import { commissionColumns, orderColumns, Network } from "./UserPanel";
import { policySchema, productSchema } from "./validation";
const verticals: [string, string][] = [
  "tourism",
  "beauty",
  "craft",
  "ai",
  "leather",
].map((k) => [k, labels[k]]);
const catalogFields: Field[] = [
  { name: "title", label: "عنوان" },
  { name: "vertical", label: "حوزه", type: "select", options: verticals },
  {
    name: "subtype",
    label: "نوع",
    hint: "برای گردشگری: مقصد، تور یا اقامتگاه",
  },
  { name: "price", label: "قیمت (تومان)", type: "number", min: 1, max: 1e12 },
  {
    name: "stock",
    label: "موجودی / ظرفیت قابل فروش",
    type: "number",
    min: 0,
    max: 1e6,
  },
  {
    name: "duration_days",
    label: "مدت اشتراک AI (روز)",
    type: "number",
    min: 1,
    max: 3650,
  },
  {
    name: "cancel_hours",
    label: "مهلت لغو پس از پرداخت (ساعت)",
    type: "number",
    min: 0,
    max: 720,
  },
  { name: "published", label: "منتشر شود", type: "checkbox" },
  { name: "description", label: "توضیحات", type: "textarea", full: true },
  {
    name: "images",
    label: "گالری تصاویر محصول",
    type: "media",
    required: false,
    full: true,
  },
  {
    name: "taxonomy",
    label: "شناسهٔ دسته‌ها و برچسب‌ها؛ هر خط یک شناسه",
    type: "textarea",
    required: false,
    full: true,
  },
];
const definitions: Record<
  string,
  { title: string; fields: Field[]; columns: [string, string, string?][] }
> = {
  products: {
    title: "محصول / تور / پلن",
    fields: [...catalogFields, ...extendedCatalogFields],
    columns: [
      ["title", "عنوان"],
      ["sku", "SKU"],
      ["family", "خانواده"],
      ["vertical", "حوزه"],
      ["price", "قیمت", "money"],
      ["stock", "موجودی", "money"],
      ["published", "منتشرشده", "bool"],
    ],
  },
  taxonomy: {
    title: "دسته یا برچسب",
    fields: [
      { name: "name", label: "نام" },
      {
        name: "kind",
        label: "نوع",
        type: "select",
        options: [
          ["category", "دسته‌بندی"],
          ["tag", "برچسب"],
        ],
      },
      { name: "vertical", label: "حوزه", type: "select", options: verticals },
    ],
    columns: [
      ["name", "نام"],
      ["kind", "نوع"],
      ["vertical", "حوزه"],
      ["id", "شناسه برای محصول"],
    ],
  },
  ranks: {
    title: "رتبه",
    fields: [
      { name: "name", label: "نام رتبه" },
      {
        name: "personal_threshold",
        label: "حداقل فروش شخصی (تومان)",
        type: "number",
        min: 0,
        max: 1e12,
      },
      {
        name: "group_threshold",
        label: "حداقل فروش گروهی (تومان)",
        type: "number",
        min: 0,
        max: 1e12,
      },
      {
        name: "bonus_bps",
        label: "پورسانت رتبه (درصد)",
        type: "number",
        min: 0,
        max: 100,
        step: 0.01,
      },
    ],
    columns: [
      ["name", "نام"],
      ["personal_threshold", "فروش شخصی لازم", "money"],
      ["group_threshold", "فروش گروهی لازم", "money"],
      ["bonus_bps", "نرخ / یک‌صدم درصد"],
    ],
  },
  missions: {
    title: "مأموریت",
    fields: [
      { name: "title", label: "عنوان" },
      {
        name: "metric",
        label: "معیار",
        type: "select",
        options: [
          ["personal_sales", "فروش شخصی (تومان)"],
          ["group_sales", "فروش گروهی (تومان)"],
          ["referrals", "تعداد دعوت موفق"],
          ["orders", "تعداد سفارش پرداخت‌شده"],
        ],
      },
      { name: "target", label: "هدف", type: "number", min: 1, max: 1e12 },
      { name: "active", label: "فعال", type: "checkbox" },
    ],
    columns: [
      ["title", "عنوان"],
      ["metric", "معیار"],
      ["target", "هدف", "money"],
      ["active", "فعال", "bool"],
    ],
  },
  content: {
    title: "محتوا",
    fields: [
      {
        name: "kind",
        label: "نوع",
        type: "select",
        options: [
          ["blog", "وبلاگ"],
          ["banner", "بنر"],
          ["page", "صفحه ثابت"],
        ],
      },
      {
        name: "slug",
        label: "نشانی کوتاه انگلیسی",
        hint: "فقط حروف کوچک، عدد و خط تیره",
      },
      { name: "title", label: "عنوان" },
      { name: "image", label: "نشانی تصویر HTTPS", required: false },
      {
        name: "body",
        label: "متن محتوا",
        type: "textarea",
        full: true,
        max: 12000,
      },
      { name: "published", label: "منتشر شود", type: "checkbox" },
    ],
    columns: [
      ["title", "عنوان"],
      ["kind", "نوع"],
      ["slug", "نشانی"],
      ["published", "انتشار", "bool"],
    ],
  },
};
export function AdminCrud({
  resource,
  refresh,
  onChange,
}: {
  resource: string;
  refresh: number;
  onChange: () => void;
}) {
  const def = definitions[resource],
    [edit, setEdit] = useState<RecordData | null>(null),
    [remove, setRemove] = useState<RecordData | null>(null);
  const initial = edit
    ? {
        ...edit,
        ...(resource === "products"
          ? {
              ...Object.fromEntries(
                Object.entries(JSON.parse(edit.details || "{}")).map(
                  ([k, v]) => ["detail_" + k, v],
                ),
              ),
              images: JSON.parse(edit.images || "[]").join("\n"),
              taxonomy: JSON.parse(edit.taxonomy || "[]"),
            }
          : {}),
        ...(resource === "ranks"
          ? {
              bonus_bps:
                edit.bonus_bps === undefined ? "" : edit.bonus_bps / 100,
            }
          : {}),
      }
    : {};
  return (
    <Localized>
      <>
        <button
          className="portal-button primary"
          onClick={() => setEdit({})}
          style={{ marginBottom: 22 }}
        >
          افزودن {def.title}
        </button>
        <Listing
          endpoint={"admin/" + resource}
          refresh={refresh}
          columns={def.columns}
          filters={{ vertical: resource === "products" }}
          actions={(r) => (
            <Localized>
              <>
                <button className="portal-button" onClick={() => setEdit(r)}>
                  ویرایش
                </button>
                {resource === "products" && (
                  <button
                    className="portal-button"
                    onClick={() => {
                      const details = JSON.parse(r.details || "{}");
                      setEdit({
                        ...r,
                        id: undefined,
                        stock: 0,
                        published: 0,
                        details: JSON.stringify({
                          ...details,
                          sku: "",
                          family: details.family || "",
                        }),
                      });
                    }}
                  >
                    ساخت تنوع جدید
                  </button>
                )}
                <button
                  className="portal-button danger"
                  onClick={() => setRemove(r)}
                >
                  حذف
                </button>
                {resource === "content" && r.published === 1 && (
                  <a
                    className="portal-button"
                    href={"/pages/" + r.slug}
                    target="_blank"
                    rel="noreferrer"
                  >
                    مشاهده
                  </a>
                )}
              </>
            </Localized>
          )}
        />
        {edit && (
          <Modal
            title={(edit.id ? "ویرایش " : "افزودن ") + def.title}
            onClose={() => setEdit(null)}
          >
            {resource === "products" && (
              <p className="portal-notice">
                هر رنگ، سایز یا ظرفیت با قیمت و موجودی مستقل، یک SKU جداست. برای
                اتصال تنوع‌ها، کد خانواده یکسان وارد کنید. اطلاعات اختصاصی با
                انتخاب حوزه نمایش داده می‌شوند.
              </p>
            )}
            <CatalogForm
              resource={resource}
              initial={initial}
              fields={def.fields}
              onSubmit={async (d) => {
                if (edit.id) d.id = edit.id;
                if (resource === "products") {
                  const details = {
                    ...emptyCatalogDetails(),
                    ...JSON.parse(edit.details || "{}"),
                  };
                  for (const key of Object.keys(d))
                    if (key.startsWith("detail_")) {
                      details[key.slice(7)] = d[key];
                      delete d[key];
                    }
                  d.details = details;
                  if (edit.id) {
                    d.expected_stock = edit.stock;
                    d.expected_updated_at = edit.updated_at;
                  }

                  d.images = d.images
                    .split("\n")
                    .map((v: string) => v.trim())
                    .filter(Boolean);
                  d.taxonomy = d.taxonomy || [];
                  const valid = productSchema.safeParse(d);
                  if (!valid.success)
                    throw new Error(
                      "ورودی محصول معتبر نیست؛ قیمت، تصویر و شناسهٔ دسته‌ها را بررسی کنید.",
                    );
                }
                if (resource === "ranks")
                  d.bonus_bps = Math.round(d.bonus_bps * 100);
                await api("admin/" + resource, "POST", d);
                setEdit(null);
                onChange();
              }}
            />
          </Modal>
        )}
        {remove && (
          <Modal title="حذف رکورد" onClose={() => setRemove(null)}>
            <p>{remove.title || remove.name}</p>
            <Form
              fields={[{ name: "reason", label: "دلیل حذف" }]}
              submit="تأیید حذف"
              onSubmit={async (d) => {
                await api("admin/" + resource + "/" + remove.id, "DELETE", d);
                setRemove(null);
                onChange();
              }}
            />
          </Modal>
        )}
      </>
    </Localized>
  );
}
export function FinancialDashboard({
  refresh,
  reportsOnly = false,
}: {
  refresh: number;
  reportsOnly?: boolean;
}) {
  const [q, setQ] = useState("");
  const state = useData(
    "admin/" + (reportsOnly ? "reports" : "dashboard") + "?" + q,
    refresh,
  );
  return (
    <Localized>
      <>
        <Filter dates onChange={setQ} />
        <DataState state={state}>
          {(d) => (
            <Localized>
              <>
                {d.health && (
                  <>
                    <div className="portal-stats">
                      <Stat label="فروش خالص بازه" value={d.health.revenue} />
                      <Stat
                        label="پورسانت ثبت‌شده"
                        value={d.health.commissionLiability}
                      />
                      <Stat label="برداشت پرداخت‌شده" value={d.health.paid} />
                      <Stat
                        label="نسبت تعهد پورسانت به فروش"
                        value={
                          d.health.ratioBps === null
                            ? "—"
                            : d.health.ratioBps / 100
                        }
                        unit="درصد"
                      />
                    </div>
                    <div className="portal-card">
                      <h2>
                        سلامت پرداخت‌ها{" "}
                        <span className={"portal-tag " + d.health.status}>
                          {d.health.status === "red"
                            ? "بحرانی"
                            : d.health.status === "yellow"
                              ? "نیازمند توجه"
                              : d.health.status === "unconfigured"
                                ? "تنظیمات مالی تکمیل نشده"
                                : "عادی"}
                        </span>
                      </h2>
                      <p>
                        توقف دستی: {d.health.paused ? "فعال" : "غیرفعال"} ·
                        برداشت در انتظار: {amount(d.pendingWithdrawals)}
                      </p>
                      <p className="portal-notice">
                        بیشترین نسبت تعهد یا پرداخت نقدی برای کنترل سلامت
                        استفاده می‌شود. نسبت وجه برداشت‌شده به فروش:{" "}
                        {d.health.cashPayoutBps === null
                          ? "بدون فروش؛ نسبت تعریف نشده"
                          : amount(d.health.cashPayoutBps / 100) + "٪"}
                        . نسبت بازه‌های کوتاه ممکن است به‌دلیل تفاوت زمان فروش و
                        تسویه افزایش یابد.
                      </p>
                    </div>
                  </>
                )}
                <div className="portal-stats">
                  <Stat label="کل اعضا" value={d.members.total} unit="نفر" />
                  <Stat
                    label="عضو جدید در بازه"
                    value={d.members.new_members}
                    unit="نفر"
                  />
                  <Stat label="عضو فعال" value={d.members.active} unit="نفر" />
                  <Stat
                    label="عضو غیرفعال"
                    value={d.members.inactive}
                    unit="نفر"
                  />
                </div>
                <div className="portal-card">
                  <h2>فروش و پورسانت در طول زمان</h2>
                  {d.trend.length ? (
                    <>
                      <div
                        className="portal-chart"
                        role="img"
                        aria-label="نمودار فروش سبز و پورسانت طلایی؛ دادهٔ دقیق در جدول زیر"
                      >
                        {d.trend.map((r: RecordData) => {
                          const max = Math.max(
                            ...d.trend.map((v: RecordData) =>
                              Math.max(1, v.sales, v.commissions),
                            ),
                          );
                          return (
                            <Localized key={r.day}>
                              <div
                                title={`${r.day}: ${amount(r.sales)} / ${amount(r.commissions)}`}
                              >
                                <span
                                  style={{
                                    height: (r.sales / max) * 100 + "%",
                                  }}
                                />
                                <span
                                  style={{
                                    height: (r.commissions / max) * 100 + "%",
                                  }}
                                />
                              </div>
                            </Localized>
                          );
                        })}
                      </div>
                      <h3>روند نسبت پرداخت نقدی به فروش</h3>
                      <div
                        className="portal-chart"
                        role="img"
                        aria-label="نسبت پرداخت نقدی روزانه؛ مقادیر دقیق در جدول"
                      >
                        {d.trend.map((r: RecordData) => {
                          const ratio = r.sales ? r.paid / r.sales : null;
                          const max = Math.max(
                            1,
                            ...d.trend.map((v: RecordData) =>
                              v.sales ? v.paid / v.sales : 0,
                            ),
                          );
                          return (
                            <Localized key={r.day}>
                              <div
                                title={`${r.day}: ${ratio === null ? "بدون فروش" : amount(ratio * 100) + "%"}`}
                              >
                                <span
                                  style={{
                                    height:
                                      ratio === null
                                        ? "0%"
                                        : (ratio / max) * 100 + "%",
                                  }}
                                />
                              </div>
                            </Localized>
                          );
                        })}
                      </div>
                      <p>
                        روزها بر مبنای UTC هستند. پرداخت بدون فروش همان روز،
                        نسبت تعریف‌شده ندارد.
                      </p>
                      <Table
                        rows={d.trend.map((r: RecordData) => ({
                          ...r,
                          payoutRatio: r.sales
                            ? amount((r.paid / r.sales) * 100) + "%"
                            : "—",
                          ratio: r.sales
                            ? Math.round((r.commissions / r.sales) * 10000) /
                              100
                            : 0,
                        }))}
                        columns={[
                          ["day", "روز"],
                          ["sales", "فروش (تومان)", "money"],
                          ["commissions", "پورسانت (تومان)", "money"],
                          ["ratio", "نسبت پورسانت به فروش (%)", "money"],
                          ["paid", "پرداخت نقدی (تومان)", "money"],
                          ["payoutRatio", "نسبت پرداخت به فروش"],
                        ]}
                      />
                    </>
                  ) : (
                    <p className="portal-empty">
                      فروشی در این بازه ثبت نشده است.
                    </p>
                  )}
                </div>
                <div className="portal-card">
                  <h2>فروش به تفکیک حوزه</h2>
                  <Table
                    rows={d.byVertical}
                    columns={[
                      ["vertical", "حوزه"],
                      ["orders", "تعداد", "money"],
                      ["sales", "فروش", "money"],
                    ]}
                  />
                </div>
                <div className="portal-card">
                  <h2>تبدیل و ریزش</h2>
                  <p>
                    تبدیل معرفی به خرید:{" "}
                    {amount(Math.round(d.referralConversion * 10000) / 100)}٪
                  </p>
                  <p>
                    ریزش اشتراک:{" "}
                    {amount(Math.round(d.subscriptionChurn * 10000) / 100)}٪
                  </p>
                  {Object.values(d.definitions).map((s: any) => (
                    <Localized key={s}>
                      <p className="portal-notice">{s}</p>
                    </Localized>
                  ))}
                  <div className="portal-row">
                    <DownloadButton
                      path={"admin/reports?" + q + "&format=csv"}
                      filename="homay-report.csv"
                    >
                      خروجی CSV همهٔ گزارش‌ها
                    </DownloadButton>
                    <DownloadButton
                      path={"admin/reports?" + q + "&format=xlsx"}
                      filename="homay-report.xlsx"
                    >
                      خروجی Excel
                    </DownloadButton>
                  </div>
                </div>
              </>
            </Localized>
          )}
        </DataState>
      </>
    </Localized>
  );
}
export function CommissionPolicy({
  refresh,
  onChange,
}: {
  refresh: number;
  onChange: () => void;
}) {
  const s = useData("admin/policy", refresh);
  return (
    <Localized>
      <DataState state={s}>
        {(d) => (
          <Localized>
            <div className="portal-card">
              <h2>تنظیم موتور پورسانت</h2>
              <p className="portal-notice">
                درصدها روی مبلغ واقعی فروش تومانی محاسبه می‌شوند. ترتیب تخصیص:
                مستقیم، سطحی و رتبه، سپس باینری. سقف هر سفارش بر همهٔ انواع
                اولویت دارد. تغییرات برای سفارش‌های جدید است؛ تسویهٔ قبلی
                بازنویسی نمی‌شود.
              </p>
              <Form
                initial={
                  d.policy
                    ? {
                        ...d.policy,
                        directBps: d.policy.directBps / 100,
                        binaryBps: d.policy.binaryBps / 100,
                        maxPayoutBps: d.policy.maxPayoutBps / 100,
                        warningBps: d.policy.warningBps / 100,
                        criticalBps: d.policy.criticalBps / 100,
                        levels: d.policy.levels
                          .map((n: number) => n / 100)
                          .join(","),
                      }
                    : {}
                }
                fields={[
                  {
                    name: "directBps",
                    label: "پورسانت مستقیم (%)",
                    type: "number",
                    min: 0,
                    max: 100,
                    step: 0.01,
                  },
                  {
                    name: "levels",
                    label: "درصد سطوح بعد از معرف مستقیم",
                    required: false,
                    hint: "با ویرگول جدا کنید؛ مثال: ۲،۱ را با ارقام انگلیسی بنویسید. خالی یعنی بدون سطح بعدی.",
                  },
                  {
                    name: "binaryBps",
                    label: "پورسانت حجم متعادل باینری (%)",
                    type: "number",
                    min: 0,
                    max: 100,
                    step: 0.01,
                  },
                  {
                    name: "maxPayoutBps",
                    label: "سقف مجموع پورسانت هر فروش (%)",
                    type: "number",
                    min: 0,
                    max: 100,
                    step: 0.01,
                  },
                  {
                    name: "warningBps",
                    label: "آستانه هشدار (%)",
                    type: "number",
                    min: 0,
                    max: 100,
                    step: 0.01,
                  },
                  {
                    name: "criticalBps",
                    label: "آستانه توقف بحرانی (%)",
                    type: "number",
                    min: 0.01,
                    max: 100,
                    step: 0.01,
                  },
                  {
                    name: "withdrawMin",
                    label: "حداقل برداشت (تومان)",
                    type: "number",
                    min: 1,
                    max: 1e12,
                  },
                  {
                    name: "withdrawMax",
                    label: "حداکثر برداشت (تومان)",
                    type: "number",
                    min: 1,
                    max: 1e12,
                  },
                  {
                    name: "paused",
                    label: "توقف دستی پرداخت‌های جدید",
                    type: "checkbox",
                  },
                  { name: "reason", label: "دلیل تغییر", full: true },
                ]}
                onSubmit={async (f) => {
                  const { reason, ...p } = f;
                  for (const k of [
                    "directBps",
                    "binaryBps",
                    "maxPayoutBps",
                    "warningBps",
                    "criticalBps",
                  ])
                    p[k] = Math.round(p[k] * 100);
                  p.levels = p.levels
                    ? p.levels
                        .split(/[,،]/)
                        .map((v: string) => Math.round(Number(v.trim()) * 100))
                    : [];
                  const valid = policySchema.safeParse(p);
                  if (!valid.success)
                    throw new Error(
                      "درصدها و حدهای مالی سازگار نیستند. جمع مستقیم و سطوح نباید از سقف بیشتر باشد.",
                    );
                  await api("admin/policy", "POST", { policy: p, reason });
                  onChange();
                }}
              />
            </div>
          </Localized>
        )}
      </DataState>
    </Localized>
  );
}
export function AdminOrders({
  refresh,
  onChange,
  role,
}: {
  refresh: number;
  onChange: () => void;
  role: string;
}) {
  const [selected, setSelected] = useState<RecordData | null>(null);
  return (
    <Localized>
      <>
        <Listing
          endpoint="admin/orders"
          refresh={refresh}
          columns={[["name", "خریدار"], ...orderColumns]}
          filters={{
            dates: true,
            vertical: true,
            statuses: [
              "pending",
              "processing",
              "shipped",
              "delivered",
              "cancelled",
              "refunded",
            ],
          }}
          actions={(r) => (
            <Localized>
              <button className="portal-button" onClick={() => setSelected(r)}>
                مدیریت
              </button>
            </Localized>
          )}
        />
        {selected && (
          <Modal title={selected.title} onClose={() => setSelected(null)}>
            <p>شناسه: {selected.id}</p>
            <p>مرجع پرداخت: {selected.payment_ref || "پرداخت تأیید نشده"}</p>
            <Form
              fields={[
                {
                  name: "action",
                  label: "عملیات",
                  type: "select",
                  options: [
                    ["shipped", "ارسال‌شده"],
                    ["delivered", "تحویل‌شده"],
                    ...(["finance", "superadmin"].includes(role)
                      ? [
                          ["refund", "لغو و بازگشت وجه به کیف پول"] as [
                            string,
                            string,
                          ],
                        ]
                      : []),
                  ],
                },
                {
                  name: "reason",
                  label: "دلیل تغییر / شرح بازگشت وجه",
                  type: "textarea",
                  full: true,
                },
              ]}
              onSubmit={async (d) => {
                await api("admin/orders", "PATCH", { ...d, id: selected.id });
                setSelected(null);
                onChange();
              }}
            />
          </Modal>
        )}
      </>
    </Localized>
  );
}
export function AdminWithdrawals({
  refresh,
  onChange,
}: {
  refresh: number;
  onChange: () => void;
}) {
  const [selected, setSelected] = useState<RecordData | null>(null);
  return (
    <Localized>
      <>
        <Listing
          endpoint="admin/withdrawals"
          refresh={refresh}
          filters={{ statuses: ["pending", "approved", "rejected", "paid"] }}
          columns={[
            ["name", "کاربر"],
            ["amount", "مبلغ", "money"],
            ["iban", "شبا"],
            ["status", "وضعیت", "status"],
            ["reason", "یادداشت"],
            ["bank_reference", "مرجع بانکی"],
            ["approver_name", "تأییدکننده اول"],
            ["payer_name", "ثبت‌کننده پرداخت"],
            ["created_at", "تاریخ", "date"],
          ]}
          actions={(r) => (
            <Localized>
              <button className="portal-button" onClick={() => setSelected(r)}>
                بررسی
              </button>
            </Localized>
          )}
        />
        {selected && (
          <Modal title="بررسی برداشت" onClose={() => setSelected(null)}>
            <p>
              {selected.name} · {amount(selected.amount)} تومان
            </p>
            <p className="portal-code">{selected.iban}</p>
            <p className="portal-notice">
              تأیید درخواست، مبلغ رزروشده را در همان تراکنش دیتابیس از کیف پول
              کسر می‌کند. «پرداخت‌شده» را تنها بعد از انجام انتقال واقعی بانکی و
              دریافت مرجع ثبت کنید. ثبت پرداخت باید توسط مدیر دیگری انجام شود؛
              صاحب برداشت نمی‌تواند پرداخت خودش را تأیید کند. برای درخواست
              تأییدشده قدیمی بدون تأییدکننده ثبت‌شده، ابتدا تأیید نخست را ثبت
              کنید.
            </p>
            <Form
              fields={[
                {
                  name: "status",
                  label: "تصمیم",
                  type: "select",
                  options: [
                    ["approved", "تأیید برای تسویه"],
                    ["rejected", "رد و آزادسازی مبلغ"],
                    ["paid", "ثبت انتقال بانکی انجام‌شده"],
                  ],
                },
                {
                  name: "reference",
                  label: "مرجع واقعی انتقال بانکی",
                  required: false,
                },
                {
                  name: "reason",
                  label: "یادداشت / دلیل",
                  type: "textarea",
                  full: true,
                },
              ]}
              onSubmit={async (d) => {
                if (!d.reference) delete d.reference;
                await api("admin/withdrawals", "PATCH", {
                  ...d,
                  id: selected.id,
                });
                setSelected(null);
                onChange();
              }}
            />
          </Modal>
        )}
      </>
    </Localized>
  );
}
export function AdminUsers({
  refresh,
  onChange,
  role,
}: {
  refresh: number;
  onChange: () => void;
  role: string;
}) {
  const { locale } = useSiteLocale();

  const [selected, setSelected] = useState<RecordData | null>(null);
  const detail = useData(
    "admin/users/" + (selected?.id || "00000000-0000-0000-0000-000000000000"),
    refresh,
  );
  return (
    <Localized>
      <>
        <Listing
          endpoint="admin/users"
          refresh={refresh}
          columns={[
            ["name", "نام"],
            ["email", "ایمیل"],
            ["phone", "موبایل"],
            ["role", "نقش"],
            ["blocked", "مسدود", "bool"],
            ["created_at", "عضویت", "date"],
          ]}
          actions={(r) => (
            <Localized>
              <button className="portal-button" onClick={() => setSelected(r)}>
                پروفایل و دسترسی
              </button>
            </Localized>
          )}
        />
        {selected && (
          <Modal title={selected.name} onClose={() => setSelected(null)}>
            <DataState state={detail}>
              {(d) => (
                <Localized>
                  <>
                    <div className="portal-stats">
                      <Stat label="موجودی" value={d.wallet.available} />
                      <Stat
                        label="پورسانت در انتظار"
                        value={d.wallet.pending}
                      />
                    </div>
                    <p>شناسه کاربر: {d.user.id}</p>
                    {d.memberDetails && (
                      <div>
                        <h3>مشخصات تکمیلی</h3>
                        <p>
                          {JSON.parse(d.memberDetails.details).firstName}{" "}
                          {JSON.parse(d.memberDetails.details).lastName} ·{" "}
                          {JSON.parse(d.memberDetails.details).country} /{" "}
                          {JSON.parse(d.memberDetails.details).city}
                        </p>
                        <p>{JSON.parse(d.memberDetails.details).occupation}</p>
                        <p>
                          {d.memberDetails.contact_verified_at
                            ? "تأیید راه تماس ثبت شده"
                            : "بدون سابقه تأیید در فرم جدید"}{" "}
                          · احراز رسمی مدارک انجام نشده
                        </p>
                      </div>
                    )}
                    {d.consent && (
                      <p>
                        پذیرش قوانین: {d.consent.version} ·{" "}
                        {date(d.consent.accepted_at, locale)}
                      </p>
                    )}
                    <p>رتبه: {d.rank.current?.name || "بدون رتبه"}</p>
                    <h3>سفارش‌ها</h3>
                    <Table rows={d.orders} columns={orderColumns} />
                    <h3>پورسانت‌ها</h3>
                    <Table rows={d.commissions} columns={commissionColumns} />
                    <h3>زیرمجموعه</h3>
                    <Table
                      rows={d.network.nodes}
                      columns={[
                        ["name", "نام"],
                        ["depth", "سطح"],
                        ["leg", "جایگاه"],
                      ]}
                    />
                  </>
                </Localized>
              )}
            </DataState>
            <Form
              initial={selected}
              fields={[
                { name: "blocked", label: "حساب مسدود شود", type: "checkbox" },
                ...(role === "superadmin"
                  ? [
                      {
                        name: "role",
                        label: "نقش",
                        type: "select",
                        options: [
                          "user",
                          "superadmin",
                          "content",
                          "support",
                          "finance",
                        ].map((v) => [v, labels[v]] as [string, string]),
                      } as Field,
                    ]
                  : []),
                {
                  name: "reason",
                  label: "دلیل تغییر",
                  type: "textarea",
                  full: true,
                },
              ]}
              onSubmit={async (d) => {
                await api("admin/users", "PATCH", { ...d, id: selected.id });
                setSelected(null);
                onChange();
              }}
            />
          </Modal>
        )}
      </>
    </Localized>
  );
}
export function AdminNetwork({
  refresh,
  onChange,
  user,
}: {
  refresh: number;
  onChange: () => void;
  user: RecordData;
}) {
  return (
    <Localized>
      <>
        <Network user={user} admin refresh={refresh} />
        <div className="portal-card">
          <h2>جابه‌جایی عضو</h2>
          <p className="portal-notice">
            تغییر شبکه فقط روی محاسبات آینده اثر دارد. سوابق مالی و حجم‌های
            باینری قبلی به ذی‌نفع اصلی تعلق دارند.
          </p>
          <Form
            fields={[
              { name: "id", label: "شناسه عضو" },
              {
                name: "sponsor",
                label: "شناسه معرف جدید (خالی: بدون معرف)",
                required: false,
              },
              {
                name: "parent",
                label: "شناسه والد باینری (خالی: ریشه)",
                required: false,
              },
              {
                name: "leg",
                label: "جایگاه باینری",
                type: "select",
                required: false,
                options: [
                  ["left", "چپ"],
                  ["right", "راست"],
                ],
              },
              {
                name: "reason",
                label: "دلیل جابه‌جایی",
                type: "textarea",
                full: true,
              },
            ]}
            onSubmit={async (d) => {
              await api("admin/network", "PATCH", {
                ...d,
                sponsor: d.sponsor || null,
                parent: d.parent || null,
                leg: d.leg || null,
              });
              onChange();
            }}
          />
        </div>
      </>
    </Localized>
  );
}
export function Settings({
  refresh,
  onChange,
}: {
  refresh: number;
  onChange: () => void;
}) {
  const s = useData("admin/settings", refresh);
  return (
    <Localized>
      <>
        <ServiceHealth refresh={refresh} />
        <div className="portal-card">
          <h2>تنظیمات سرویس‌ها و برند</h2>
          <p className="portal-notice">
            کلیدها در دیتابیس رمزنگاری می‌شوند و پس از ذخیره قابل نمایش نیستند.
            کلید اصلی رمزنگاری فقط روی سرور نگه‌داری می‌شود. فعال‌شدن OTP و
            پرداخت نیازمند حساب معتبر ارائه‌دهنده است.
          </p>
          <Form
            fields={[
              {
                name: "key",
                label: "تنظیم",
                type: "select",
                options: [
                  ["google_client_id", "شناسه عمومی برنامه گوگل"],
                  ["resend_key", "کلید API ایمیل Resend"],
                  ["email_from", "ایمیل فرستندهٔ تأییدشده"],
                  ["turnstile_site_key", "کلید عمومی کپچا Turnstile"],
                  ["turnstile_secret_key", "کلید محرمانه کپچا Turnstile"],
                  ["kavenegar_key", "کلید API پیامک کاوه‌نگار"],
                  ["sms_template", "نام الگوی OTP پیامک"],
                  ["sms_sender", "شماره فرستنده پیامک اعلان"],
                  ["zarinpal_merchant", "شناسه پذیرنده زرین‌پال"],
                  ["site_name", "نام سایت"],
                  ["site_logo", "نشانی لوگو"],
                  ["site_contact", "اطلاعات تماس"],
                  ["site_email", "ایمیل رسمی ارتباط با ما"],
                  ["site_ceo_name", "نام مدیرعامل"],
                  ["fx_source_url", "نشانی سرویس نرخ ارز (همراه کلید API)"],
                  ["fx_source_path", "مسیر نرخ دلار در پاسخ سرویس، مثل usd_sell.value"],
                  ["fx_source_unit", "واحد نرخ سرویس: rial یا toman"],
                  ["fx_usd_manual", "نرخ دستی دلار به ریال (پشتیبان)"],
                ],
              },
              {
                name: "value",
                label: "مقدار جدید",
                type: "textarea",
                full: true,
                max: 2000,
              },
              { name: "reason", label: "دلیل تغییر", full: true },
            ]}
            onSubmit={async (d) => {
              await api("admin/settings", "POST", d);
              onChange();
            }}
          />
        </div>
        <DataState state={s}>
          {(d) => (
            <Localized>
              <Table
                rows={d.rows}
                columns={[
                  ["key", "تنظیم"],
                  ["value", "مقدار عمومی"],
                  ["configured", "تنظیم‌شده", "bool"],
                  ["secret", "محرمانه", "bool"],
                ]}
              />
            </Localized>
          )}
        </DataState>
      </>
    </Localized>
  );
}
export function Flags({
  refresh,
  onChange,
}: {
  refresh: number;
  onChange: () => void;
}) {
  const [selected, setSelected] = useState<RecordData | null>(null);
  return (
    <Localized>
      <>
        <p className="portal-notice">
          پرچم‌ها تنها نشانهٔ نیاز به بررسی هستند؛ مسدودسازی خودکار یا اثبات
          تخلف محسوب نمی‌شوند.
        </p>
        <Listing
          endpoint="admin/flags"
          refresh={refresh}
          columns={[
            ["name", "عضو"],
            ["kind", "الگو"],
            ["detail", "شرح"],
            ["resolved", "بررسی‌شده", "bool"],
            ["created_at", "تاریخ", "date"],
          ]}
          actions={(r) =>
            !r.resolved && (
              <Localized>
                <button
                  className="portal-button"
                  onClick={() => setSelected(r)}
                >
                  ثبت بررسی
                </button>
              </Localized>
            )
          }
        />
        {selected && (
          <Modal title="نتیجهٔ بررسی" onClose={() => setSelected(null)}>
            <Form
              fields={[
                {
                  name: "reason",
                  label: "نتیجه و دلیل",
                  type: "textarea",
                  full: true,
                },
              ]}
              onSubmit={async (d) => {
                await api("admin/flags", "PATCH", { ...d, id: selected.id });
                setSelected(null);
                onChange();
              }}
            />
          </Modal>
        )}
      </>
    </Localized>
  );
}

function CatalogForm(props: {
  resource: string;
  initial: RecordData;
  fields: Field[];
  onSubmit: (d: RecordData) => Promise<void>;
}) {
  return props.resource === "products" ? (
    <Localized>
      <ProductFieldsForm {...props} />
    </Localized>
  ) : (
    <Localized>
      <Form {...props} />
    </Localized>
  );
}
function ProductFieldsForm(props: {
  initial: RecordData;
  fields: Field[];
  onSubmit: (d: RecordData) => Promise<void>;
}) {
  const state = useData("admin/catalog-options");
  return (
    <Localized>
      <DataState state={state}>
        {(d) => (
          <Localized>
            <Form
              {...props}
              fields={props.fields.map((f) =>
                f.name === "taxonomy"
                  ? {
                      ...f,
                      label: "دسته‌ها و برچسب‌ها",
                      type: "multiselect",
                      hint: "چند گزینه را می‌توانید انتخاب کنید؛ دسته‌ها در بخش دسته‌بندی مدیریت می‌شوند.",
                      options: d.rows.map((r: RecordData) => [
                        r.id,
                        `${labels[r.vertical]} · ${r.kind === "tag" ? "برچسب" : "دسته"}: ${r.name}`,
                      ]),
                    }
                  : f,
              )}
            />
          </Localized>
        )}
      </DataState>
    </Localized>
  );
}
