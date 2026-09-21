"use client";
import { useRef, useState } from "react";
import Localized from "../i18n/Localized";
import { api, RecordData, date } from "./client";
import {
  DataState,
  Form,
  Listing,
  Pagination,
  Table,
  useData,
} from "./Widgets";
type Props = { refresh: number; onChange: () => void };
const statuses: [string, string][] = [
  ["waiting_support", "در انتظار پشتیبانی"],
  ["waiting_user", "در انتظار پاسخ شما"],
  ["closed", "بسته‌شده"],
];
const priorities: [string, string][] = [
  ["normal", "عادی"],
  ["high", "زیاد"],
  ["urgent", "فوری"],
];
const categories: [string, string][] = [
  ["order", "سفارش"],
  ["payment", "پرداخت"],
  ["network", "شبکه"],
  ["account", "حساب کاربری"],
  ["other", "سایر"],
];
function TicketThread({
  id,
  staff,
  refresh,
  onChange,
  onBack,
}: { id: string; staff: boolean; onBack: () => void } & Props) {
  const [page, setPage] = useState(1),
    [replyVersion, setReplyVersion] = useState(0),
    key = useRef("");
  const endpoint = (staff ? "admin/" : "") + "tickets/" + id;
  const state = useData(endpoint + "?page=" + page, refresh);
  return (
    <Localized>
      <button className="portal-button" onClick={onBack}>
        بازگشت به درخواست‌ها
      </button>
      <DataState state={state}>
        {(d) => (
          <>
            <section className="portal-card">
              <h2 translate="no">{d.ticket.subject}</h2>
              <p>
                شناسه درخواست: <bdi translate="no">{id}</bdi>
              </p>
              <p>
                {statuses.find(([v]) => v === d.ticket.status)?.[1]} ·{" "}
                {priorities.find(([v]) => v === d.ticket.priority)?.[1]}
              </p>
              {d.ticket.order_id && (
                <p>
                  سفارش مرتبط: <bdi translate="no">{d.ticket.order_id}</bdi>
                </p>
              )}
              <div className="support-thread" aria-label="گفت‌وگوی پشتیبانی">
                {d.rows.map((m: RecordData) => (
                  <article
                    key={m.id}
                    className={
                      m.internal
                        ? "support-message internal"
                        : "support-message"
                    }
                  >
                    <p>
                      <strong translate="no">{m.author}</strong> ·{" "}
                      <time dateTime={m.created_at}>{date(m.created_at)}</time>
                      {!!m.internal && <strong> · یادداشت داخلی</strong>}
                    </p>
                    <p className="support-body" translate="no">
                      {m.body}
                    </p>
                  </article>
                ))}
              </div>
              <Pagination page={page} more={d.hasMore} onChange={setPage} />
              <h3>پاسخ تازه</h3>
              <p>
                در پیام، رمز عبور، کد ورود یا اطلاعات کامل کارت بانکی ننویسید.
                پاسخ به درخواست بسته‌شده، آن را دوباره باز می‌کند.
              </p>
              <Form
                key={replyVersion}
                submit="ارسال پاسخ"
                fields={[
                  {
                    name: "body",
                    label: "متن پاسخ",
                    type: "textarea",
                    full: true,
                    max: 8000,
                  },
                  ...(staff
                    ? [
                        {
                          name: "internal",
                          label: "یادداشت داخلی؛ فقط برای پشتیبانی",
                          type: "checkbox",
                        },
                      ]
                    : []),
                ]}
                onSubmit={async (f) => {
                  key.current ||= crypto.randomUUID();
                  await api(endpoint + "/replies", "POST", {
                    ...f,
                    internal: !!f.internal,
                    idempotencyKey: key.current,
                  });
                  key.current = "";
                  setReplyVersion((v) => v + 1);
                  setPage(1);
                  onChange();
                }}
              />
            </section>
            <section className="portal-card">
              <h3>{staff ? "مدیریت درخواست" : "بستن درخواست"}</h3>
              {staff ? (
                <Form
                  key={d.ticket.version}
                  initial={{
                    status: d.ticket.status,
                    priority: d.ticket.priority,
                    assigneeId: d.ticket.assignee_id || "",
                  }}
                  fields={[
                    {
                      name: "status",
                      label: "وضعیت درخواست",
                      type: "select",
                      options: statuses,
                    },
                    {
                      name: "priority",
                      label: "اولویت",
                      type: "select",
                      options: priorities,
                    },
                    {
                      name: "assigneeId",
                      label: "شناسه مسئول رسیدگی",
                      required: false,
                      hint: "شناسه حساب همکار دارای مجوز پشتیبانی؛ خالی یعنی بدون مسئول",
                    },
                    { name: "reason", label: "دلیل تغییر", full: true },
                  ]}
                  onSubmit={async (f) => {
                    await api(endpoint, "PATCH", {
                      ...f,
                      assigneeId: f.assigneeId || null,
                      expectedVersion: d.ticket.version,
                    });
                    onChange();
                  }}
                />
              ) : d.ticket.status !== "closed" ? (
                <Form
                  submit="بستن درخواست"
                  fields={[
                    { name: "reason", label: "دلیل بستن درخواست", full: true },
                  ]}
                  onSubmit={async (f) => {
                    await api(endpoint, "PATCH", {
                      ...f,
                      expectedVersion: d.ticket.version,
                    });
                    onChange();
                  }}
                />
              ) : (
                <p>این درخواست بسته شده است.</p>
              )}
            </section>
          </>
        )}
      </DataState>
    </Localized>
  );
}
export function TicketsPanel({
  staff = false,
  refresh,
  onChange,
}: Props & { staff?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null),
    key = useRef("");
  if (selected)
    return (
      <TicketThread
        key={selected}
        id={selected}
        staff={staff}
        refresh={refresh}
        onChange={onChange}
        onBack={() => setSelected(null)}
      />
    );
  return (
    <Localized>
      <section className="portal-card">
        <h2>
          {staff ? "مرکز رسیدگی به درخواست‌ها" : "پشتیبانی و درخواست‌های من"}
        </h2>
        <p>
          درخواست‌ها و پاسخ‌های مربوط به حساب و سفارش خود را از این بخش پیگیری
          کنید.
        </p>
      </section>
      {!staff && (
        <section className="portal-card">
          <h3>درخواست تازه</h3>
          <Form
            submit="ثبت درخواست"
            initial={{ category: "other", priority: "normal" }}
            fields={[
              { name: "subject", label: "موضوع درخواست", max: 200 },
              {
                name: "category",
                label: "موضوع پشتیبانی",
                type: "select",
                options: categories,
              },
              {
                name: "priority",
                label: "اولویت",
                type: "select",
                options: priorities,
              },
              { name: "orderId", label: "شناسه سفارش مرتبط", required: false },
              {
                name: "body",
                label: "شرح درخواست",
                type: "textarea",
                full: true,
                max: 8000,
              },
            ]}
            onSubmit={async (f) => {
              key.current ||= crypto.randomUUID();
              const result = await api("tickets", "POST", {
                ...f,
                orderId: f.orderId || null,
                idempotencyKey: key.current,
              });
              key.current = "";
              setSelected(result.id);
              onChange();
            }}
          />
        </section>
      )}
      <Listing
        endpoint={staff ? "admin/tickets" : "tickets"}
        refresh={refresh}
        filters={{ statuses: statuses.map(([v]) => v) }}
        columns={[
          ["subject", "موضوع"],
          ...(staff ? [["user_name", "عضو"] as [string, string]] : []),
          ["category", "موضوع پشتیبانی", "status"],
          ["priority", "اولویت", "status"],
          ["status", "وضعیت", "status"],
          ["updated_at", "آخرین تغییر", "date"],
        ]}
        actions={(row) => (
          <button className="portal-button" onClick={() => setSelected(row.id)}>
            مشاهده گفت‌وگو
          </button>
        )}
      />
    </Localized>
  );
}
export function BinarySchedulePanel({ refresh, onChange }: Props) {
  const state = useData("admin/binary-schedule", refresh);
  return (
    <Localized>
      <DataState state={state}>
        {(d) => (
          <>
            <section className="portal-card">
              <h2>زمان‌بندی تسویه باینری</h2>
              <p>
                زمان‌ها به وقت تهران هستند و این انتخاب روی سفارش‌های جدید اعمال
                می‌شود. حالت روزانه یا هفتگی، باینری را از بودجه باقی‌مانده همان
                سفارش‌های پرداخت‌شده محاسبه می‌کند. تغییر این تنظیم، قواعد
                سفارش‌های قبلی را عوض نمی‌کند.
              </p>
              <p>
                حجم و سفارش پرداخت‌شده پس از مرز دوره به دوره بعد می‌روند. شروط
                فعالیت، انقضای حجم و سقف روزانه هنگام اجرا کنترل می‌شوند. پردازش
                هر سفارش در هر دوره تا ۵۰۰ تطبیق است و باقی حجم در دوره بعد
                بررسی می‌شود.
              </p>
              <Form
                key={JSON.stringify(d.schedule)}
                initial={d.schedule}
                fields={[
                  {
                    name: "mode",
                    label: "شیوه محاسبه",
                    type: "select",
                    options: [
                      ["immediate", "هنگام خرید"],
                      ["daily", "روزانه"],
                      ["weekly", "هفتگی"],
                    ],
                  },
                  {
                    name: "hour",
                    label: "ساعت تسویه به وقت تهران",
                    type: "number",
                    min: 0,
                    max: 23,
                  },
                  {
                    name: "weekday",
                    label: "روز تسویه هفتگی",
                    type: "select",
                    options: [
                      ["6", "شنبه"],
                      ["0", "یکشنبه"],
                      ["1", "دوشنبه"],
                      ["2", "سه‌شنبه"],
                      ["3", "چهارشنبه"],
                      ["4", "پنجشنبه"],
                      ["5", "جمعه"],
                    ],
                  },
                  { name: "reason", label: "دلیل تغییر", full: true },
                ]}
                onSubmit={async (f) => {
                  const { reason, ...schedule } = f;
                  await api("admin/binary-schedule", "POST", {
                    reason,
                    schedule: {
                      ...schedule,
                      weekday: Number(schedule.weekday),
                    },
                  });
                  onChange();
                }}
              />
            </section>
            <section className="portal-card">
              <h3>آخرین پردازش‌های دوره‌ای</h3>
              <Table
                rows={d.rows}
                columns={[
                  ["order_id", "شناسه سفارش"],
                  ["cycle_key", "دوره"],
                  ["amount", "پورسانت (تومان)", "money"],
                  ["matches", "تعداد تطبیق"],
                  ["created_at", "زمان پردازش", "date"],
                ]}
              />
            </section>
          </>
        )}
      </DataState>
    </Localized>
  );
}
export function MerchantReviewPanel({
  rows,
  onChange,
  userId,
}: {
  rows: RecordData[];
  onChange: () => void;
  userId?: string;
}) {
  const [selected, setSelected] = useState<RecordData | null>(null);
  return (
    <Localized>
      <section className="portal-card">
        <h3>تأیید دوم پرداخت پذیرندگان</h3>
        <Table
          rows={rows}
          columns={[
            ["merchant_name", "پذیرنده"],
            ["amount", "مبلغ (تومان)", "money"],
            ["bank_reference", "شماره پیگیری"],
            ["first_name", "ثبت‌کننده"],
            ["second_name", "بررسی‌کننده دوم"],
            ["status", "وضعیت", "status"],
          ]}
          actions={(r) =>
            r.status === "pending" && r.first_actor !== userId ? (
              <button className="portal-button" onClick={() => setSelected(r)}>
                بررسی پرداخت
              </button>
            ) : null
          }
        />
        {selected && (
          <>
            <p>
              شناسه پرداخت: <bdi translate="no">{selected.id}</bdi>
            </p>
            <Form
              key={selected.id}
              fields={[
                {
                  name: "action",
                  label: "نتیجه بررسی",
                  type: "select",
                  options: [
                    ["confirm", "تأیید پرداخت انجام‌شده"],
                    ["reject", "رد ثبت پرداخت"],
                  ],
                },
                { name: "reason", label: "دلیل بررسی", full: true },
              ]}
              onSubmit={async (f) => {
                await api("admin/merchant-settlements/review", "POST", {
                  ...f,
                  id: selected.id,
                });
                setSelected(null);
                onChange();
              }}
            />
            <button className="portal-button" onClick={() => setSelected(null)}>
              انصراف
            </button>
          </>
        )}
      </section>
    </Localized>
  );
}
