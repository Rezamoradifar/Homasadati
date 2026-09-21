"use client";
import { useRef, useState } from "react";
import Localized from "../i18n/Localized";
import { api, RecordData } from "./client";
import {
  DataState,
  Field,
  Form,
  Listing,
  Modal,
  Notice,
  Pagination,
  Stat,
  Table,
  useData,
} from "./Widgets";

const merchantFields: Field[] = [
  { name: "name", label: "نام پذیرنده" },
  { name: "category", label: "دسته‌بندی" },
  { name: "city", label: "شهر" },
  { name: "address", label: "آدرس", required: false },
  { name: "phone", label: "شماره تماس", required: false },
  { name: "website", label: "وب‌سایت HTTPS", required: false },
  {
    name: "description",
    label: "توضیحات",
    type: "textarea",
    required: false,
    full: true,
  },
  { name: "active", label: "فعال", type: "checkbox" },
  { name: "reason", label: "دلیل تغییر", full: true },
];
const rewardFields: Field[] = [
  { name: "title", label: "عنوان" },
  {
    name: "description",
    label: "توضیحات",
    type: "textarea",
    required: false,
    full: true,
  },
  {
    name: "points",
    label: "امتیاز لازم",
    type: "number",
    min: 1,
    max: 1000000000,
  },
  {
    name: "stock",
    label: "ظرفیت باقی‌مانده",
    type: "number",
    min: 0,
    max: 1000000,
  },
  { name: "active", label: "فعال", type: "checkbox" },
  { name: "reason", label: "دلیل تغییر", full: true },
];
export function ClubCatalogAdmin({
  resource,
  refresh,
  onChange,
}: {
  resource: "merchants" | "rewards";
  refresh: number;
  onChange: () => void;
}) {
  const [edit, setEdit] = useState<RecordData | null>(null);
  const title = resource === "merchants" ? "پذیرنده" : "مزیت باشگاه";
  return (
    <Localized>
      <>
        <button className="portal-button" onClick={() => setEdit({})}>
          افزودن {title}
        </button>
        <p>برای توقف نمایش، گزینه فعال را بردارید؛ سوابق قبلی حفظ می‌شوند.</p>
        <Listing
          endpoint={`admin/${resource}`}
          refresh={refresh}
          columns={
            resource === "merchants"
              ? [
                  ["name", "نام پذیرنده"],
                  ["category", "دسته‌بندی"],
                  ["city", "شهر"],
                  ["active", "فعال", "bool"],
                ]
              : [
                  ["title", "عنوان"],
                  ["points", "امتیاز لازم"],
                  ["stock", "ظرفیت باقی‌مانده"],
                  ["active", "فعال", "bool"],
                ]
          }
          actions={(r) => (
            <button
              className="portal-button"
              onClick={() => setEdit({ ...r, reason: "" })}
            >
              ویرایش
            </button>
          )}
        />
        {edit && (
          <Modal title={title} onClose={() => setEdit(null)}>
            <Form
              fields={resource === "merchants" ? merchantFields : rewardFields}
              initial={edit}
              onSubmit={async (d) => {
                await api(`admin/${resource}`, "POST", {
                  ...d,
                  ...(edit.id ? { id: edit.id } : {}),
                  ...(edit.id && resource==="rewards" ? {expected_stock:edit.stock,expected_updated_at:edit.updated_at}:{}),
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
export function PointsAdmin({
  refresh,
  onChange,
}: {
  refresh: number;
  onChange: () => void;
}) {
  const key = useRef("");
  return (
    <Localized>
      <>
        <section className="portal-card">
          <h2>ثبت سند امتیاز</h2>
          <p>
            امتیاز باشگاه مستقل از پول و حجم باینری است. هر اصلاح با دلیل و نام
            مدیر ثبت می‌شود.
          </p>
          <Form
            fields={[
              { name: "userId", label: "شناسهٔ کاربر" },
              {
                name: "delta",
                label: "تغییر امتیاز؛ مثبت یا منفی",
                type: "number",
                min: -1000000000,
                max: 1000000000,
              },
              {
                name: "reason",
                label: "دلیل تغییر",
                type: "textarea",
                full: true,
              },
            ]}
            resetOnSuccess
            onSubmit={async (d) => {
              key.current ||= crypto.randomUUID();
              await api("admin/loyalty", "POST", {
                ...d,
                idempotencyKey: key.current,
              });
              key.current = "";
              onChange();
            }}
          />
        </section>
        <Listing
          endpoint="admin/loyalty"
          refresh={refresh}
          columns={[
            ["name", "عضو"],
            ["delta", "تغییر امتیاز"],
            ["reason", "توضیحات"],
            ["created_at", "تاریخ", "date"],
          ]}
        />
      </>
    </Localized>
  );
}
export function RedemptionsAdmin({
  refresh,
  onChange,
}: {
  refresh: number;
  onChange: () => void;
}) {
  const [edit, setEdit] = useState<RecordData | null>(null);
  return (
    <Localized>
      <>
        <Listing
          endpoint="admin/redemptions"
          refresh={refresh}
          columns={[
            ["name", "عضو"],
            ["title", "مزیت"],
            ["points", "امتیاز"],
            ["status", "وضعیت", "status"],
            ["reason", "توضیحات"],
          ]}
          actions={(r) =>
            r.status === "requested" ? (
              <button className="portal-button" onClick={() => setEdit(r)}>
                بررسی درخواست
              </button>
            ) : null
          }
        />
        {edit && (
          <Modal title="بررسی درخواست مزیت" onClose={() => setEdit(null)}>
            <Form
              fields={[
                {
                  name: "status",
                  label: "نتیجه",
                  type: "select",
                  options: [
                    ["fulfilled", "تحویل‌شده"],
                    ["cancelled", "لغو و بازگشت امتیاز"],
                  ],
                },
                {
                  name: "reason",
                  label: "دلیل تغییر",
                  type: "textarea",
                  full: true,
                },
              ]}
              onSubmit={async (d) => {
                await api("admin/redemptions", "POST", { ...d, id: edit.id });
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
export function LoyaltyPanel({
  refresh,
  onChange,
}: {
  refresh: number;
  onChange: () => void;
}) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<RecordData | null>(null),
    [cancel,setCancel] = useState<RecordData|null>(null);
  const key = useRef("");
  const state = useData(`loyalty?page=${page}`, refresh);
  return (
    <Localized>
      <DataState state={state}>
        {(d) => (
          <Localized>
            <>
              <Stat
                label="موجودی امتیاز باشگاه"
                value={d.balance}
                unit="امتیاز"
              />
              <div className="portal-stats"><Stat label="امتیاز خرید در انتظار آزادسازی" value={d.loyalty.pending} unit="امتیاز"/><Stat label="کسری ناشی از مرجوعی" value={d.loyalty.debt} unit="امتیاز"/></div>
              <section className="portal-card"><h2>سطح امتیازی من</h2><p translate="no">{d.loyalty.current?.name || '—'}</p><p translate="no">{d.loyalty.current?.benefits}</p>{d.loyalty.next&&<p><span>امتیاز لازم تا سطح بعدی</span>: {Math.max(0,d.loyalty.next.threshold-d.loyalty.earned)}</p>}</section>
              <p className="portal-notice">
                امتیاز باشگاه اعتبار نقدی یا قابل‌برداشت نیست؛ برای مزایای فعال
                استفاده می‌شود.
              </p>
              <section className="portal-card">
                <h2>مزایای باشگاه</h2>
                <Table
                  rows={d.rewards}
                  columns={[
                    ["title", "عنوان"],
                    ["description", "توضیحات"],
                    ["points", "امتیاز لازم"],
                    ["stock", "ظرفیت باقی‌مانده"],
                  ]}
                  actions={(r) => (
                    <button
                      className="portal-button"
                      disabled={r.stock < 1 || d.balance < r.points}
                      onClick={() => {
                        setSelected(r);
                        key.current = crypto.randomUUID();
                      }}
                    >
                      درخواست مزیت
                    </button>
                  )}
                />
              </section>
              <section className="portal-card">
                <h2>درخواست‌های من</h2>
                <Table
                  rows={d.redemptions}
                  actions={r=>r.status==='requested'?<button className="portal-button" onClick={()=>setCancel(r)}>لغو درخواست</button>:null}
                  columns={[
                    ["title", "عنوان"],
                    ["points", "امتیاز"],
                    ["status", "وضعیت", "status"],
                    ["reason", "توضیحات"],
                  ]}
                />
              </section>
              <section className="portal-card">
                <h2>گردش امتیازات</h2>
                <Table
                  rows={d.rows}
                  columns={[
                    ["delta", "تغییر امتیاز"],
                    ["reason", "توضیحات"],
                    ["created_at", "تاریخ", "date"],
                  ]}
                />
                <Pagination page={page} more={d.hasMore} onChange={setPage} />
              </section>
              <section className="portal-card"><h2>اعتبار امتیازات</h2><Table rows={d.loyalty.expiring} columns={[["remaining","امتیاز"],["expires_at","پایان اعتبار","date"]]}/><p>امتیاز بازگشتی از لغو مزیت، تاریخ انقضای اولیه خود را حفظ می‌کند. کسری مرجوعی از امتیازهای بعدی جبران می‌شود.</p></section>
              {cancel&&<Modal title="لغو درخواست مزیت" onClose={()=>setCancel(null)}><Form fields={[{name:'reason',label:'دلیل لغو'}]} onSubmit={async f=>{await api('loyalty/cancel','POST',{...f,id:cancel.id});setCancel(null);onChange();}}/></Modal>}
              {selected && (
                <Modal
                  title="تأیید درخواست مزیت"
                  onClose={() => setSelected(null)}
                >
                  <p>
                    <span translate="no">{selected.title}</span> ·{" "}
                    {selected.points} امتیاز
                  </p>
                  <Form
                    fields={[]}
                    submit="تأیید و کسر امتیاز"
                    onSubmit={async () => {
                      await api("loyalty/redeem", "POST", {
                        rewardId: selected.id,
                        idempotencyKey: key.current,
                      });
                      setSelected(null);
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
export function MerchantDirectory() {
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const state = useData(
    `merchants?q=${encodeURIComponent(query)}&page=${page}`,
  );
  return (
    <Localized>
      <section className="portal-card">
        <form
          className="portal-row"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
            setPage(1);
          }}
        >
          <label>
            جست‌وجوی پذیرنده
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="نام، شهر یا دسته‌بندی"
            />
          </label>
          <button className="portal-button" type="submit">
            جست‌وجو
          </button>
        </form>
        <DataState state={state}>
          {(d) => (
            <>
              <div className="merchant-grid">
                {d.rows.map((m: RecordData) => (
                  <article className="portal-card" key={m.id} translate="no">
                    <h2>{m.name}</h2>
                    <p>
                      {m.city} · {m.category}
                    </p>
                    <p>{m.description}</p>
                    <p>{m.address}</p>
                    <p dir="ltr">{m.phone}</p>
                    {m.website && (
                      <a href={m.website} target="_blank" rel="noreferrer">
                        {m.website}
                      </a>
                    )}
                  </article>
                ))}
              </div>
              {!d.rows.length && <p>پذیرنده‌ای با این مشخصات پیدا نشد.</p>}
              <Pagination page={page} more={d.hasMore} onChange={setPage} />
            </>
          )}
        </DataState>
      </section>
    </Localized>
  );
}
