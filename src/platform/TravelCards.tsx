"use client";
import PrivilegeCard from "../../app/PrivilegeCard";
import { useState } from "react";
import { api, amount, date, RecordData, labels } from "./client";
import { Form, DataState, useData, Notice, Table } from "./Widgets";
export const travelStatus: Record<string, string> = {
  requested: "در انتظار کارگزار",
  approved: "تأیید کارگزار؛ اعتبار رزرو شده",
  redeemed: "مصرف اعتبار ثبت شد",
  cancelled: "لغو شده",
  rejected: "رد شده",
};
const columns: [string, string, string?][] = [
  ["title", "سفر"],
  ["travel_date", "تاریخ"],
  ["amount", "اعتبار", "money"],
  ["quoted_total", "مبلغ سفر", "money"],
  ["statusLabel", "وضعیت"],
  ["reference", "پیگیری"],
  ["decision_reason", "نتیجه بررسی"],
];
export function TravelCards({
  refresh,
  onChange,
}: {
  refresh: number;
  onChange: () => void;
}) {
  const [search, setSearch] = useState("");
  const state = useData("travel-cards", refresh),
    catalog = useData(
      "catalog?vertical=tourism&q=" + encodeURIComponent(search),
      refresh,
    );
  const [selected, setSelected] = useState<RecordData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState("");
  return (
    <>
      <p className="portal-notice">
        برای هر رتبه تنظیم‌شده، یک کارت غیرنقدی به نام شما صادر می‌شود؛ خرید
        پرداخت‌شده هما تمدن و پایان مهلت لغو آن لازم است. هفت روز کاری کامل پیش
        از سفر هماهنگ کنید. جمعه و تعطیلات ثبت‌شده کارگزار در شمارش لحاظ
        نمی‌شوند؛ تقویم جاری پایین فرم دیده می‌شود.
      </p>
      <button
        className="portal-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await api("travel-cards/sync", "POST");
            onChange();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        بررسی و صدور کارت‌های واجدشرایط
      </button>
      <Notice error={error} />
      <DataState state={state}>
        {(d) => (
          <>
            {!d.cards.length ? (
              <p>
                هنوز کارت واجدشرایطی صادر نشده است؛ مبلغ اعتبار هر رتبه باید
                توسط مدیر تعیین شود.
              </p>
            ) : (
              <div className="travel-card-grid">
                {d.cards.map((c: RecordData) => (
                  <article className="travel-credit-card" key={c.id}>
                    <PrivilegeCard
                      name={c.rank_name}
                      tone={c.tone || "obsidian"}
                      level={c.level}
                      holder={c.holder_name}
                    />
                    <div className="travel-card-details">
                      <strong className="travel-balance">
                        {amount(c.available)} تومان
                      </strong>
                      <p>
                        اعتبار آزاد · رزرو: {amount(c.reserved)} · مصرف:{" "}
                        {amount(c.spent)}
                      </p>
                      <p>انقضا: {c.expires_on}</p>
                      <code>{c.id}</code>
                      <p>
                        {c.expired
                          ? "منقضی"
                          : !c.eligible
                            ? "فعلاً فاقد شرایط استفاده"
                            : "اعتبار غیرنقدی گردشگری"}
                      </p>
                      <button
                        className="portal-button gold"
                        disabled={c.expired || !c.eligible || !c.available}
                        onClick={() => {
                          setSelected(c);
                          setKey(crypto.randomUUID());
                        }}
                      >
                        هماهنگی سفر
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {selected && (
              <div className="portal-card">
                <h2>درخواست هماهنگی با کارگزار</h2>
                <p>
                  این مرحله رزرو قطعی یا صدور بلیت نیست. پس از تأیید کارگزار،
                  پرداخت مابه‌التفاوت جداگانه هماهنگ می‌شود.
                </p>
                <label>
                  جستجوی سفر
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="نام سفر یا مقصد"
                  />
                </label>
                <DataState state={catalog}>
                  {(products) =>
                    products.rows.length ? (
                      <Form
                        initial={{ amount: selected.available }}
                        fields={[
                          {
                            name: "productId",
                            label: "سفر موجود",
                            type: "select",
                            options: products.rows.map((p: RecordData) => [
                              p.id,
                              p.title + " · " + amount(p.price) + " تومان",
                            ]),
                          },
                          {
                            name: "travelDate",
                            label: "تاریخ سفر (میلادی)",
                            type: "date",
                          },
                          {
                            name: "amount",
                            label: "اعتبار درخواستی (تومان)",
                            type: "number",
                            min: 1,
                            max: selected.available,
                          },
                          {
                            name: "note",
                            label: "توضیحات و راه هماهنگی",
                            type: "textarea",
                            full: true,
                          },
                        ]}
                        submit="ثبت درخواست هماهنگی"
                        onSubmit={async (v) => {
                          await api("travel-cards/requests", "POST", {
                            ...v,
                            cardId: selected.id,
                            idempotencyKey: key,
                          });
                          setSelected(null);
                          onChange();
                        }}
                      />
                    ) : (
                      <p>هنوز سفر منتشرشده‌ای موجود نیست.</p>
                    )
                  }
                </DataState>
                <p>
                  روزهای تعطیل هفتگی کارگزار:{" "}
                  {d.calendar.weekends
                    .map(
                      (n: number) =>
                        [
                          "یکشنبه",
                          "دوشنبه",
                          "سه‌شنبه",
                          "چهارشنبه",
                          "پنجشنبه",
                          "جمعه",
                          "شنبه",
                        ][n],
                    )
                    .join("، ") || "ندارد"}
                </p>
                <p>
                  تعطیلات اختصاصی:{" "}
                  {d.calendar.holidays.join("، ") || "ثبت نشده"}
                </p>
                <button onClick={() => setSelected(null)}>بستن فرم</button>
              </div>
            )}
            <h2>درخواست‌های شما</h2>
            <Table
              rows={d.rows.map((r: RecordData) => ({
                ...r,
                statusLabel: travelStatus[r.status],
              }))}
              columns={columns as any}
              actions={(r) =>
                r.status === "requested" ? (
                  <button
                    className="portal-button"
                    onClick={async () => {
                      setError("");
                      try {
                        await api("travel-cards/cancel", "POST", {
                          id: r.id,
                          reason: "لغو به درخواست عضو",
                        });
                        onChange();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    لغو درخواست و آزادسازی اعتبار
                  </button>
                ) : null
              }
            />
          </>
        )}
      </DataState>
    </>
  );
}
export function AdminTravel({
  refresh,
  onChange,
  role,
}: {
  refresh: number;
  onChange: () => void;
  role: string;
}) {
  const state = useData("admin/travel", refresh),
    [selected, setSelected] = useState<RecordData | null>(null);
  return (
    <DataState state={state}>
      {(d) => (
        <>
          <p className="portal-notice">
            اعتبار صادرشده آزاد: {amount(d.liability.available)} تومان ·
            رزروشده: {amount(d.liability.reserved)} · مصرف‌شده:{" "}
            {amount(d.liability.spent)}. این تعهد غیرنقدی جدا از موجودی کیف پول
            است.
          </p>
          {role !== "support" && (
            <>
              <section className="portal-card">
                <h2>اعتبار سفر هر رتبه</h2>
                <a href="/club/ranks" target="_blank" rel="noreferrer">
                  مشاهده هفت رتبه و طراحی کارت‌ها
                </a>
                <Form
                  fields={[]}
                  submit="ایجاد هفت رتبه پیشنهادی با صدور غیرفعال"
                  onSubmit={async () => {
                    await api("admin/travel/presets", "POST", {});
                    onChange();
                  }}
                />
                <p>
                  هر عضو یک کارت برای هر رتبه دریافت می‌کند. تغییر قانون فقط
                  صدورهای بعدی را تغییر می‌دهد؛ اعتبار کارت موجود افزایش یا
                  تمدید نمی‌شود.
                </p>
                {d.ranks.length ? (
                  <Form
                    fields={[
                      {
                        name: "rankId",
                        label: "رتبه",
                        type: "select",
                        options: d.ranks.map((r: RecordData) => [r.id, r.name]),
                      },
                      {
                        name: "amount",
                        label: "مبلغ اعتبار (تومان)",
                        type: "number",
                        min: 1,
                      },
                      {
                        name: "validDays",
                        label: "مدت اعتبار (روز)",
                        type: "number",
                        min: 8,
                        max: 3650,
                      },
                      { name: "active", label: "صدور فعال", type: "checkbox" },
                      { name: "reason", label: "دلیل تغییر", full: true },
                    ]}
                    onSubmit={async (v) => {
                      await api("admin/travel/rules", "POST", v);
                      onChange();
                    }}
                  />
                ) : (
                  <p>ابتدا رتبه‌ها را در مدیریت تعریف کنید.</p>
                )}
                <Table
                  rows={d.rules}
                  columns={[
                    ["name", "رتبه"],
                    ["amount", "اعتبار", "money"],
                    ["valid_days", "روز اعتبار"],
                    ["active", "فعال", "bool"],
                  ]}
                />
              </section>
              <section className="portal-card">
                <h2>تقویم کاری کارگزار</h2>
                <Form
                  initial={{
                    weekends: d.calendar.weekends.map(String),
                    holidays: d.calendar.holidays.join("\n"),
                  }}
                  fields={[
                    {
                      name: "weekends",
                      label: "روزهای تعطیل هفتگی",
                      type: "multiselect",
                      required: false,
                      options: [
                        "یکشنبه",
                        "دوشنبه",
                        "سه‌شنبه",
                        "چهارشنبه",
                        "پنجشنبه",
                        "جمعه",
                        "شنبه",
                      ].map((v, i) => [String(i), v]),
                    },
                    {
                      name: "holidays",
                      label: "تعطیلات دیگر؛ هر خط YYYY-MM-DD",
                      type: "textarea",
                      required: false,
                      full: true,
                    },
                    { name: "reason", label: "دلیل تغییر", full: true },
                  ]}
                  onSubmit={async (v) => {
                    await api("admin/travel/calendar", "POST", {
                      weekends: v.weekends.map(Number),
                      holidays: v.holidays.split(/\s+/).filter(Boolean),
                      reason: v.reason,
                    });
                    onChange();
                  }}
                />
              </section>
            </>
          )}
          <h2>درخواست‌های هماهنگی سفر</h2>
          <p>
            فهرست ۱۰۰ درخواست اخیر. تأیید، یک واحد ظرفیت محصول را رزرو می‌کند.
            مصرف اعتبار را فقط پس از ثبت هماهنگی نهایی و پیگیری تسویه
            مابه‌التفاوت ثبت کنید؛ انتقال وجه و صدور بلیت خودکار نیست.
          </p>
          <Table
            rows={d.rows.map((r: RecordData) => ({
              ...r,
              statusLabel: travelStatus[r.status],
            }))}
            columns={[["name", "عضو"], ...columns] as any}
            actions={(r) =>
              ["requested", "approved"].includes(r.status) ? (
                <button onClick={() => setSelected(r)}>بررسی</button>
              ) : null
            }
          />
          {selected && (
            <section className="portal-card">
              <h3>
                {selected.name} · {selected.title}
              </h3>
              <p>{selected.note}</p>
              <p>
                مابه‌التفاوت: {amount(selected.quoted_total - selected.amount)}{" "}
                تومان
              </p>
              <Form
                fields={[
                  {
                    name: "status",
                    label: "تصمیم",
                    type: "select",
                    options:
                      selected.status === "requested"
                        ? [
                            ["approved", "تأیید و رزرو ظرفیت"],
                            ["rejected", "رد درخواست"],
                          ]
                        : [
                            ...(role !== "support"
                              ? [
                                  ["redeemed", "ثبت مصرف اعتبار"] as [
                                    string,
                                    string,
                                  ],
                                ]
                              : []),
                            ["cancelled", "لغو و آزادسازی ظرفیت"],
                          ],
                  },
                  {
                    name: "reference",
                    label: "پیگیری هماهنگی / تسویه مابه‌التفاوت",
                    required: false,
                  },
                  {
                    name: "reason",
                    label: "دلیل و نتیجه بررسی",
                    type: "textarea",
                    full: true,
                  },
                ]}
                onSubmit={async (v) => {
                  await api("admin/travel/review", "POST", {
                    ...v,
                    id: selected.id,
                  });
                  setSelected(null);
                  onChange();
                }}
              />
              <button onClick={() => setSelected(null)}>بستن</button>
            </section>
          )}
        </>
      )}
    </DataState>
  );
}
