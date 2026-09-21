"use client";
import { MerchantReviewPanel } from "./SupportPanels";
import { useRef, useState } from "react";
import Localized from "../i18n/Localized";
import { api, RecordData } from "./client";
import {
  DataState,
  Field,
  Form,
  Listing,
  Modal,
  Pagination,
  Stat,
  Table,
  useData,
} from "./Widgets";
import { adminTabs } from "./admin-navigation";
type Props = { refresh: number; onChange: () => void };
const reason: Field = { name: "reason", label: "دلیل تغییر", full: true };
const n = (name: string, label: string, min = 0, max = 1e12): Field => ({
  name,
  label,
  type: "number",
  min,
  max,
});
const rulesFields: Field[] = [
  n("leftRatio", "ضریب شاخه چپ", 1, 100),
  n("rightRatio", "ضریب شاخه راست", 1, 100),
  n("dailyCap", "سقف روزانه باینری (تومان؛ صفر یعنی بدون سقف)"),
  n("carryDays", "اعتبار حجم (روز؛ صفر یعنی بدون انقضا)", 0, 3650),
  n("personalMinimum", "حداقل خرید شخصی در بازه فعالیت (تومان)"),
  n("activityDays", "بازه فعالیت (روز)", 1, 3650),
  n("directMinimum", "حداقل معرف مستقیم دارای خرید در بازه", 0, 10000),
];
export function BinaryRulesPanel({ refresh, onChange }: Props) {
  const state = useData("admin/binary-rules", refresh),
    [result, setResult] = useState<RecordData | null>(null);
  return (
    <Localized>
      <DataState state={state}>
        {(d) => (
          <Localized>
            <>
              <section className="portal-card">
                <h2>قواعد باینری</h2>
                <p>
                  تغییرات روی سفارش‌های جدید اعمال می‌شوند. روز مالی بر اساس
                  ساعت تهران است. سقف روزانه، پورسانت معلق و آزادشده را با هم در
                  نظر می‌گیرد؛ حجم مصرف‌نشده تا تاریخ اعتبار خود باقی می‌ماند.
                </p>
                <Form
                  key={JSON.stringify(d.rules)}
                  initial={d.rules}
                  fields={[...rulesFields, reason]}
                  onSubmit={async (f) => {
                    const { reason, ...rules } = f;
                    await api("admin/binary-rules", "POST", { rules, reason });
                    onChange();
                  }}
                />
              </section>
              <section className="portal-card">
                <h2>شبیه‌ساز باینری</h2>
                <p>
                  سناریوی یک عضو و یک تطبیق را با قواعد ذخیره‌شده بررسی کنید.
                  این ابزار پول، امتیاز یا حجم واقعی ثبت نمی‌کند. پورسانت روی
                  حجم هر واحد نسبت محاسبه می‌شود؛ مثلاً نسبت ۲ به ۱، دو واحد چپ
                  و یک واحد راست مصرف می‌کند.
                </p>
                <Form
                  fields={[
                    n("left", "حجم چپ"),
                    n("right", "حجم راست"),
                    n("budget", "بودجه باقی‌مانده سفارش پس از سایر پورسانت‌ها"),
                    n("alreadyEarned", "پورسانت باینری امروز"),
                    { ...n("rate", "نرخ باینری (%)", 0, 100), step: 0.01 },
                    {
                      name: "eligible",
                      label: "عضو شرایط فعالیت را دارد",
                      type: "checkbox",
                    },
                  ]}
                  initial={{ alreadyEarned: 0, eligible: true }}
                  submit="محاسبه سناریو"
                  onSubmit={async (f) => {
                    const { rate, ...rest } = f;
                    setResult(
                      await api("admin/binary-simulate", "POST", {
                        ...rest,
                        rateBps: Math.round(rate * 100),
                        rules: d.rules,
                      }),
                    );
                  }}
                />
                {result && (
                  <div className="portal-stats" role="status">
                    <Stat label="پورسانت محاسبه‌شده" value={result.amount} />
                    <Stat label="حجم باقی‌مانده چپ" value={result.leftCarry} />
                    <Stat
                      label="حجم باقی‌مانده راست"
                      value={result.rightCarry}
                    />
                  </div>
                )}
              </section>
            </>
          </Localized>
        )}
      </DataState>
    </Localized>
  );
}
export function LoyaltyRulesPanel({ refresh, onChange }: Props) {
  const state = useData("admin/loyalty-policy", refresh),
    [edit, setEdit] = useState<RecordData | null>(null);
  return (
    <Localized>
      <>
        <DataState state={state}>
          {(d) => (
            <Localized>
              <section className="portal-card">
                <h2>امتیاز خرید</h2>
                <p>
                  امتیاز هر سفارش از تقسیم مبلغ خرید بر واحد هزینه محاسبه و به
                  پایین گرد می‌شود. امتیاز پس از پایان مهلت لغو آزاد می‌شود؛
                  قوانین هنگام سفارش ذخیره می‌شوند. صفر در مدت اعتبار یعنی بدون
                  انقضا.
                </p>
                <Form
                  key={JSON.stringify(d.policy)}
                  initial={
                    d.configured ? d.policy : { enabled: false, expiryDays: 0 }
                  }
                  fields={[
                    {
                      name: "enabled",
                      label: "امتیاز خودکار خرید فعال باشد",
                      type: "checkbox",
                    },
                    n("spendUnit", "مبلغ هر واحد خرید (تومان)", 1),
                    n("pointsPerUnit", "امتیاز هر واحد خرید", 1, 1000000),
                    n(
                      "expiryDays",
                      "اعتبار امتیاز از زمان آزادسازی (روز)",
                      0,
                      3650,
                    ),
                    reason,
                  ]}
                  onSubmit={async (f) => {
                    const { reason, ...policy } = f;
                    await api("admin/loyalty-policy", "POST", {
                      policy,
                      reason,
                    });
                    onChange();
                  }}
                />
              </section>
            </Localized>
          )}
        </DataState>
        <section className="portal-card">
          <h2>سطوح امتیازی باشگاه</h2>
          <p>
            سطح باشگاه از مجموع امتیازات خرید غیرمرجوع تعیین می‌شود. مصرف یا
            انقضای امتیاز، سابقه خرید را کاهش نمی‌دهد؛ مرجوعی آن را اصلاح
            می‌کند.
          </p>
          <button
            className="portal-button"
            onClick={() => setEdit({ active: true })}
          >
            افزودن سطح
          </button>
          <Listing
            endpoint="admin/loyalty-levels"
            refresh={refresh}
            columns={[
              ["name", "نام"],
              ["threshold", "حداقل امتیاز خرید"],
              ["benefits", "مزایا"],
              ["active", "فعال", "bool"],
            ]}
            actions={(r) => (
              <button className="portal-button" onClick={() => setEdit(r)}>
                ویرایش
              </button>
            )}
          />
        </section>
        {edit && (
          <Modal title="سطح باشگاه" onClose={() => setEdit(null)}>
            <Form
              initial={edit}
              fields={[
                { name: "name", label: "نام" },
                n("threshold", "حداقل امتیاز خرید"),
                {
                  name: "benefits",
                  label: "مزایا",
                  type: "textarea",
                  required: false,
                  full: true,
                },
                { name: "active", label: "فعال", type: "checkbox" },
                reason,
              ]}
              onSubmit={async (f) => {
                await api("admin/loyalty-levels", "POST", {
                  ...f,
                  ...(edit.id ? { id: edit.id } : {}),
                });
                setEdit(null);
                onChange();
              }}
            />
          </Modal>
        )}
      </>
    </Localized>
  );
}
function permissionLabel(value: string) {
  const [resource, mode] = value.split(":");
  const labels: Record<string, string> = {
    "catalog-options": "گزینه‌های دسته‌بندی",
    refunds: "مرجوعی سفارش",
    "binary-simulate": "شبیه‌ساز باینری",
    "loyalty-levels": "سطوح امتیازی",
    media: "رسانه‌ها",
    "travel-manage": "قواعد و مصرف کارت سفر",
  };
  return (
    (labels[resource] ||
      adminTabs.find((t) => t[0] === resource)?.[1] ||
      resource) +
    " · " +
    (mode === "read" ? "مشاهده" : "تغییر")
  );
}
export function AccessPanel({ refresh, onChange }: Props) {
  const [page, setPage] = useState(1),
    [edit, setEdit] = useState<RecordData | null>(null);
  const state = useData(`admin/access?page=${page}`, refresh);
  return (
    <Localized>
      <DataState state={state}>
        {(d) => (
          <Localized>
            <>
              <section className="portal-card">
                <h2>نقش‌های اختصاصی</h2>
                <p>
                  دسترسی هر حساب، مجموع نقش اصلی و نقش‌های اختصاصی فعال آن است.
                  غیرفعال‌کردن نقش، مجوزهای آن را بلافاصله لغو می‌کند. مدیریت
                  دسترسی و کلیدهای سرویس‌ها مخصوص مدیر اصلی است.
                </p>
                <button
                  className="portal-button"
                  onClick={() => setEdit({ active: true })}
                >
                  افزودن نقش
                </button>
                <Table
                  rows={d.rows}
                  columns={[
                    ["name", "نام"],
                    ["active", "فعال", "bool"],
                  ]}
                  actions={(r) => (
                    <button
                      className="portal-button"
                      onClick={() =>
                        setEdit({
                          ...r,
                          permissions: JSON.parse(r.permissions),
                        })
                      }
                    >
                      ویرایش
                    </button>
                  )}
                />
              </section>
              <section className="portal-card">
                <h2>تخصیص نقش به حساب</h2>
                <Form
                  initial={{ assigned: true }}
                  fields={[
                    { name: "userId", label: "شناسهٔ کاربر" },
                    {
                      name: "roleId",
                      label: "نقش",
                      type: "select",
                      options: d.rows.map((r: RecordData) => [r.id, r.name]),
                    },
                    {
                      name: "assigned",
                      label: "نقش به حساب اختصاص داشته باشد",
                      type: "checkbox",
                    },
                    reason,
                  ]}
                  onSubmit={async (f) => {
                    await api("admin/access/assign", "POST", f);
                    onChange();
                  }}
                />
                <Table
                  rows={d.assignments.rows}
                  columns={[
                    ["user_name", "عضو"],
                    ["role_name", "نقش"],
                    ["user_id", "شناسهٔ کاربر"],
                    ["created_at", "تاریخ", "date"],
                  ]}
                />
              </section>
              <Pagination
                page={page}
                more={d.hasMore || d.assignments.hasMore}
                onChange={setPage}
              />
              {edit && (
                <Modal title="نقش اختصاصی" onClose={() => setEdit(null)}>
                  <Form
                    initial={edit}
                    fields={[
                      { name: "name", label: "نام" },
                      {
                        name: "permissions",
                        label: "مجوزها",
                        type: "multiselect",
                        options: d.options.map((p: string) => [
                          p,
                          permissionLabel(p),
                        ]),
                        required: false,
                        full: true,
                      },
                      { name: "active", label: "فعال", type: "checkbox" },
                      reason,
                    ]}
                    onSubmit={async (f) => {
                      await api("admin/access", "POST", {
                        ...f,
                        ...(edit.id ? { id: edit.id } : {}),
                      });
                      setEdit(null);
                      onChange();
                    }}
                  />
                </Modal>
              )}
            </>
          </Localized>
        )}
      </DataState>
    </Localized>
  );
}
export function MerchantOperationsPanel({ refresh, onChange }: Props) {
  const [page, setPage] = useState(1),
    [edit, setEdit] = useState<RecordData | null>(null),
    state = useData(`admin/merchant-operations?page=${page}`, refresh);
  return (
    <Localized>
      <>
        <section className="portal-card">
          <h2>قرارداد پذیرنده</h2>
          <p>
            سهم پذیرنده و سقف پورسانت شبکه در مجموع نباید از مبلغ فروش بیشتر
            شوند. مالک قرارداد، سفارش‌های همان پذیرنده را در پنل خود می‌بیند.
            اطلاعات قرارداد در سفارش‌های جدید ثبت می‌شود.
          </p>
          <button
            className="portal-button"
            onClick={() => setEdit({ active: false })}
          >
            ثبت قرارداد
          </button>
        </section>
        <DataState state={state}>
          {(d) => (
            <>
              <Table
                rows={d.rows}
                columns={[
                  ["name", "پذیرنده"],
                  ["owner_name", "مسئول"],
                  ["reference", "شماره قرارداد"],
                  ["share_bps", "سهم از ۱۰۰۰۰"],
                  ["active", "فعال", "bool"],
                ]}
                actions={(r) => (
                  <button
                    className="portal-button"
                    onClick={() =>
                      setEdit({
                        merchantId: r.merchant_id,
                        ownerId: r.owner_id,
                        shareBps: r.share_bps,
                        reference: r.reference,
                        startsOn: r.starts_on,
                        endsOn: r.ends_on,
                        active: !!r.active,
                      })
                    }
                  >
                    ویرایش
                  </button>
                )}
              />
              <Table
                rows={d.links.rows}
                columns={[
                  ["title", "محصول"],
                  ["merchant_name", "پذیرنده"],
                  ["product_id", "شناسه محصول"],
                ]}
              />
              <Pagination
                page={page}
                more={d.hasMore || d.links.hasMore}
                onChange={setPage}
              />
            </>
          )}
        </DataState>
        <section className="portal-card">
          <h2>اتصال محصول به پذیرنده</h2>
          <Form
            fields={[
              { name: "productId", label: "شناسه محصول" },
              {
                name: "merchantId",
                label: "شناسه پذیرنده؛ خالی برای حذف اتصال",
                required: false,
              },
              reason,
            ]}
            onSubmit={async (f) => {
              await api("admin/merchant-operations/products", "POST", {
                ...f,
                merchantId: f.merchantId || null,
              });
              onChange();
            }}
          />
        </section>
        {edit && (
          <Modal title="قرارداد پذیرنده" onClose={() => setEdit(null)}>
            <Form
              initial={edit}
              fields={[
                { name: "merchantId", label: "شناسه پذیرنده" },
                { name: "ownerId", label: "شناسه حساب مسئول" },
                n("shareBps", "سهم از ۱۰۰۰۰ (مثلاً ۲۰۰۰ یعنی ۲۰٪)", 0, 10000),
                { name: "reference", label: "شماره قرارداد" },
                { name: "startsOn", label: "تاریخ شروع میلادی", type: "date" },
                { name: "endsOn", label: "تاریخ پایان میلادی", type: "date" },
                { name: "active", label: "فعال", type: "checkbox" },
                reason,
              ]}
              onSubmit={async (f) => {
                await api("admin/merchant-operations", "POST", f);
                setEdit(null);
                onChange();
              }}
            />
          </Modal>
        )}
      </>
    </Localized>
  );
}
export function MerchantSettlementsPanel({
  refresh,
  onChange,
  userId,
}: Props & { userId: string }) {
  const [page, setPage] = useState(1),
    key = useRef(""),
    state = useData(`admin/merchant-settlements?page=${page}`, refresh);
  return (
    <Localized>
      <>
        <section className="portal-card">
          <h2>ثبت پرداخت انجام‌شده به پذیرنده</h2>
          <p>
            مانده قابل تسویه از سفارش تحویل‌شده و پس از مهلت لغو ایجاد می‌شود.
            این فرم فقط پرداخت بانکی انجام‌شده را با شماره پیگیری ثبت می‌کند.
            ثبت نهایی به تأیید مدیر مجاز دوم نیاز دارد. تا آن زمان مبلغ برای
            بررسی رزرو می‌شود. مرجوعی پس از پرداخت، از مانده فروش‌های بعدی کسر
            می‌شود.
          </p>
          <Form
            fields={[
              { name: "merchantId", label: "شناسه پذیرنده" },
              n("amount", "مبلغ پرداخت (تومان)", 1),
              { name: "bankReference", label: "شماره پیگیری بانکی" },
              reason,
            ]}
            resetOnSuccess
            onSubmit={async (f) => {
              key.current ||= crypto.randomUUID();
              await api("admin/merchant-settlements", "POST", {
                ...f,
                idempotencyKey: key.current,
              });
              key.current = "";
              onChange();
            }}
          />
        </section>
        <DataState state={state}>
          {(d) => (
            <>
              <Table
                rows={d.balances.rows}
                columns={[
                  ["name", "پذیرنده"],
                  ["id", "شناسه پذیرنده"],
                  ["balance", "مانده تسویه", "money"],
                  ["reserved", "در انتظار تأیید دوم", "money"],
                ]}
              />
              <Table
                rows={d.rows}
                columns={[
                  ["name", "پذیرنده"],
                  ["kind", "نوع سند", "status"],
                  ["amount", "مبلغ", "money"],
                  ["reference", "مرجع"],
                  ["created_at", "تاریخ", "date"],
                ]}
              />
              <MerchantReviewPanel
                rows={d.reviews.rows}
                onChange={onChange}
                userId={userId}
              />
              <Table
                rows={d.payments.rows}
                columns={[
                  ["merchant_id", "شناسه پذیرنده"],
                  ["amount", "مبلغ پرداخت", "money"],
                  ["bank_reference", "شماره پیگیری بانکی"],
                  ["created_at", "تاریخ", "date"],
                ]}
              />
              <Pagination
                page={page}
                more={
                  d.hasMore ||
                  d.balances.hasMore ||
                  d.payments.hasMore ||
                  d.reviews.hasMore
                }
                onChange={setPage}
              />
            </>
          )}
        </DataState>
      </>
    </Localized>
  );
}
export function MerchantPanel({ refresh, onChange }: Props) {
  const [page, setPage] = useState(1),
    [edit, setEdit] = useState<RecordData | null>(null),
    state = useData(`merchant?page=${page}`, refresh);
  return (
    <Localized>
      <DataState state={state}>
        {(d) => (
          <Localized>
            <>
              <div className="portal-stats">
                {d.merchants.map((m: RecordData) => (
                  <Stat key={m.id} label={m.name} value={m.balance} />
                ))}
              </div>
              <section className="portal-card">
                <h2>سفارش‌های پذیرنده</h2>
                <Table
                  rows={d.orders}
                  columns={[
                    ["title", "محصول"],
                    ["quantity", "تعداد"],
                    ["status", "وضعیت", "status"],
                    ["amount", "سهم پذیرنده", "money"],
                    ["settlement_status", "وضعیت تسویه", "status"],
                  ]}
                  actions={(r) =>
                    ["processing", "shipped"].includes(r.status) ? (
                      <button
                        className="portal-button"
                        onClick={() => setEdit(r)}
                      >
                        ثبت ارسال یا تحویل
                      </button>
                    ) : null
                  }
                />
              </section>
              <section className="portal-card">
                <h2>محصولات پذیرنده</h2>
                <Table
                  rows={d.products}
                  columns={[
                    ["title", "محصول"],
                    ["price", "قیمت", "money"],
                    ["stock", "موجودی"],
                    ["published", "منتشرشده", "bool"],
                  ]}
                />
              </section>
              <section className="portal-card">
                <h2>گردش تسویه پذیرنده</h2>
                <Table
                  rows={d.rows}
                  columns={[
                    ["kind", "نوع سند", "status"],
                    ["amount", "مبلغ", "money"],
                    ["created_at", "تاریخ", "date"],
                  ]}
                />
              </section>
              <Pagination
                page={page}
                more={
                  d.hasMore || d.products.length === 30 || d.rows.length === 30
                }
                onChange={setPage}
              />
              {edit && (
                <Modal title="ثبت وضعیت سفارش" onClose={() => setEdit(null)}>
                  <Form
                    fields={[
                      {
                        name: "status",
                        label: "وضعیت",
                        type: "select",
                        options: [
                          ...(edit.status === "processing"
                            ? [["shipped", "ارسال‌شده"] as [string, string]]
                            : []),
                          ["delivered", "تحویل‌شده"],
                        ],
                      },
                      reason,
                    ]}
                    onSubmit={async (f) => {
                      await api("merchant/orders", "POST", {
                        ...f,
                        id: edit.id,
                      });
                      setEdit(null);
                      onChange();
                    }}
                  />
                </Modal>
              )}
            </>
          </Localized>
        )}
      </DataState>
    </Localized>
  );
}
export function AdminNotifications({ refresh, onChange }: Props) {
  const key = useRef("");
  return (
    <Localized>
      <>
        <section className="portal-card">
          <h2>اعلان به اعضا</h2>
          <p>
            شناسه حداکثر ۱۰۰ عضو را با ویرگول جدا کنید. اعلان مطابق ترجیح هر عضو
            داخل پنل ثبت و برای سرویس‌های فعال در صف قرار می‌گیرد.
          </p>
          <Form
            fields={[
              {
                name: "users",
                label: "شناسه اعضا",
                type: "textarea",
                full: true,
              },
              { name: "title", label: "عنوان" },
              {
                name: "body",
                label: "متن اعلان",
                type: "textarea",
                max: 4000,
                full: true,
              },
              reason,
            ]}
            resetOnSuccess
            submit="ثبت و ارسال اعلان"
            onSubmit={async (f) => {
              key.current ||= crypto.randomUUID();
              const { users, ...rest } = f;
              await api("admin/notifications", "POST", {
                ...rest,
                userIds: users.split(/[,،\s]+/).filter(Boolean),
                idempotencyKey: key.current,
              });
              key.current = "";
              onChange();
            }}
          />
        </section>
        <Listing
          endpoint="admin/notifications"
          refresh={refresh}
          columns={[
            ["id", "شناسه ارسال"],
            ["created_at", "تاریخ", "date"],
          ]}
        />
      </>
    </Localized>
  );
}
