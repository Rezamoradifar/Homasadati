"use client";

import {useSiteLocale} from "../i18n/SiteLocale";
import {catalogCopy,isPublicSpecification} from "../i18n/catalog";
import Localized from "../i18n/Localized";
import { MemberDetails } from "./MemberDetails";
import { MemberOverview } from "./MemberOverview";
import { extendedCatalogFields } from "./catalog-fields";
import { useRef, useState } from "react";
import { api, amount, date, labels, RecordData } from "./client";
import {
  DataState,
  DownloadButton,
  Filter,
  Form,
  Listing,
  Modal,
  Notice,
  Pagination,
  Stat,
  Table,
  useData,
} from "./Widgets";
export const orderColumns: [string, string, string?][] = [
  ["title", "سفارش"],
  ["vertical", "حوزه"],
  ["amount", "مبلغ (تومان)", "money"],
  ["status", "وضعیت", "status"],
  ["payment_method", "پرداخت"],
  ["created_at", "تاریخ", "date"],
];
export const commissionColumns: [string, string, string?][] = [
  ["kind", "نوع"],
  ["amount", "مبلغ (تومان)", "money"],
  ["status", "وضعیت", "status"],
  ["available_at", "زمان آزادسازی", "date"],
  ["created_at", "تاریخ", "date"],
];
export function Dashboard({ refresh, user, onNavigate }: {
  refresh: number;
  user: RecordData;
  onNavigate: (tab: string) => void;
}) {
  const s = useData("dashboard", refresh);
  return (
    <Localized><DataState state={s}>
      {(d) => (
        <Localized><>
          <MemberOverview user={user} activity={d.activity} onNavigate={onNavigate} />
          <div className="portal-stats">
            <Stat label="موجودی قابل برداشت" value={d.wallet.available} />
            <Stat label="در انتظار تسویه" value={d.wallet.pending} />
            <Stat label="فروش شخصی این ماه" value={d.sales.personal} />
            <Stat label="فروش گروهی این ماه" value={d.sales.group} />
          </div>
          {d.wallet.debt > 0 && (
            <Notice
              error={`بدهی ناشی از برگشت پورسانت: ${amount(d.wallet.debt)} تومان؛ برداشت تا تسویه ممکن نیست.`}
            />
          )}
          <div className="portal-card">
            <h2>مسیر رشد شما</h2>
            <p>رتبهٔ فعلی: {d.rank.current?.name || "هنوز رتبه‌ای کسب نشده"}</p>
            {d.rank.next ? (
              <>
                <p>رتبهٔ بعدی: {d.rank.next.name}</p>
                <div
                  className="portal-progress"
                  role="progressbar"
                  aria-label="پیشرفت رتبه"
                  aria-valuenow={Math.round(d.rank.progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: d.rank.progress * 100 + "%" }} />
                </div>
                <p>
                  {amount(Math.round(d.rank.progress * 100))}٪ · فروش شخصی مورد
                  نیاز: {amount(d.rank.next.personal_threshold)} · فروش گروهی:{" "}
                  {amount(d.rank.next.group_threshold)} تومان
                </p>
              </>
            ) : (
              <p className="portal-notice">رتبهٔ بعدی تعریف نشده است.</p>
            )}
          </div>
          <div className="portal-card">
            <h2>آخرین سفارش‌ها</h2>
            <Table rows={d.orders} columns={orderColumns} />
          </div>
          <div className="portal-card">
            <h2>آخرین پورسانت‌ها</h2>
            <Table rows={d.commissions} columns={commissionColumns} />
          </div>
        </></Localized>
      )}
    </DataState></Localized>
  );
}
export function Catalog({
  refresh,
  onChange,
}: {
  refresh: number;
  onChange: () => void;
}) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const s = useData("catalog?" + q + "&page=" + page, refresh);
  return (
    <Localized><>
      <p className="portal-notice">
        قیمت، موجودی و مهلت لغو از محصول منتشرشدهٔ مدیر خوانده می‌شود. سفارش فقط
        پس از تأیید پرداخت نهایی می‌شود.
      </p>
      <Filter
        vertical
        onChange={(v) => {
          setQ(v);
          setPage(1);
        }}
      />
      <Notice error={error} success={success} />
      <DataState state={s}>
        {(d) => (
          <Localized><>
            {d.rows.length ? (
              <div className="portal-catalog">
                {d.rows.map((p: RecordData) => (
                  <Localized key={p.id}><Product
                    product={p}
                    onFamily={(family: string) => {
                      setQ("family=" + encodeURIComponent(family));
                      setPage(1);
                    }}
                    onDone={() => {
                      setSuccess(
                        "سفارش ثبت شد. جزئیات در بخش سفارش‌ها قابل مشاهده است.",
                      );
                      onChange();
                    }}
                    onError={setError}
                  /></Localized>
                ))}
              </div>
            ) : (
              <p className="portal-empty">
                هنوز محصولی برای این فیلتر منتشر نشده است.
              </p>
            )}
            <Pagination page={page} more={d.hasMore} onChange={setPage} />
          </></Localized>
        )}
      </DataState>
    </></Localized>
  );
}
function Product({
  product: p,
  onDone,
  onError,
  onFamily,
}: {
  onFamily: (family: string) => void;
  product: RecordData;
  onDone: () => void;
  onError: (s: string) => void;
}) {
  const key = useRef(crypto.randomUUID()),
    [busy, setBusy] = useState(false);
  const images = JSON.parse(p.images),{locale}=useSiteLocale(),copy=catalogCopy({title:p.title,description:p.description,details:p.details},locale);
  return (
    <Localized><article className="portal-product">
      {images[0] && <img src={images[0]} alt={copy.title} />}
      <div>
        <small>{labels[p.vertical]}</small>
        <h2>{copy.title}</h2>
        <p>{copy.description}</p>
        <strong>{amount(p.price)} تومان</strong>
        {p.details?.comparePrice > p.price && (
          <del>{amount(p.details.comparePrice)} تومان</del>
        )}
        {p.details?.family && (
          <button
            className="portal-button"
            onClick={() => onFamily(p.details.family)}
          >
            تنوع‌های این محصول
          </button>
        )}
        {p.details && Object.values(p.details).some(Boolean) && (
          <details className="portal-product-specs">
            <summary>مشخصات کامل محصول</summary>
            <dl>
              {extendedCatalogFields
                .filter(
                  (f) =>
                    f.type !== "section" && isPublicSpecification(f.name) &&
                    (!f.sectors || f.sectors.includes(p.vertical)),
                )
                .map((f) => {
                  const value = p.details[f.name.replace("detail_", "")];
                  return value ? (
                    <Localized key={f.name}><div>
                      <dt>{f.label}</dt>
                      <dd>{String(value)}</dd>
                    </div></Localized>
                  ) : null;
                })}
            </dl>
            {images.slice(1).map((src: string) => (
              <Localized key={src}><img src={src} alt={copy.title} loading="lazy" /></Localized>
            ))}
          </details>
        )}
        <p>
          موجودی: {amount(p.stock)} · مهلت لغو: {amount(p.cancel_hours)} ساعت
        </p>
        <form
          onChange={() => {
            key.current = crypto.randomUUID();
          }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const form = new FormData(e.currentTarget);
            setBusy(true);
            onError("");
            try {
              const o = await api("orders", "POST", {
                productId: p.id,
                quantity: Number(form.get("quantity")),
                method: form.get("method"),
                idempotencyKey: key.current,
              });
              if (o.payment_method === "zarinpal" && !o.paid_at) {
                const r = await api(`orders/${o.id}/payment`, "POST");
                window.location.assign(r.url);
              } else {
                key.current = crypto.randomUUID();
                onDone();
              }
            } catch (e) {
              onError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="portal-row">
            <label>
              تعداد{" "}
              <input
                name="quantity"
                type="number"
                min={1}
                max={Math.min(p.stock, 100)}
                defaultValue={1}
                required
              />
            </label>
            <label>
              پرداخت{" "}
              <select
                name="method"
                style={{ padding: 10, border: "1px solid #d1c5b4" }}
              >
                <option value="zarinpal">درگاه بانکی</option>
                <option value="wallet">کیف پول</option>
              </select>
            </label>
          </div>
          <button
            disabled={busy || p.stock === 0}
            className="portal-button primary"
            style={{ marginTop: 16, width: "100%" }}
          >
            {busy ? "در حال ثبت…" : "ثبت سفارش و پرداخت"}
          </button>
        </form>
      </div>
    </article></Localized>
  );
}
export function Orders({
  refresh,
  onChange,
}: {
  refresh: number;
  onChange: () => void;
}) {
  const { locale } = useSiteLocale();

  const [selected, setSelected] = useState<RecordData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Localized><>
      <Listing
        endpoint="orders"
        refresh={refresh}
        columns={orderColumns}
        filters={{
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
        actions={(o) => (
          <Localized><button
            className="portal-button"
            onClick={() => {
              setSelected(o);
              setError("");
            }}
          >
            جزئیات
          </button></Localized>
        )}
      />
      {selected && (
        <Modal title="جزئیات سفارش" onClose={() => setSelected(null)}>
          <dl className="portal-details">
            {[
              ["شناسه", selected.id],
              ["عنوان", selected.title],
              [
                "SKU ثبت‌شده هنگام خرید",
                JSON.parse(selected.policy || "{}").orderTerms?.catalogDetails
                  ?.sku || "—",
              ],
              ["مبلغ", amount(selected.amount) + " تومان"],
              ["وضعیت", labels[selected.status]],
              ["روش پرداخت", labels[selected.payment_method]],
              ["مرجع پرداخت", selected.payment_ref || "تأیید نشده"],
              ["تاریخ", date(selected.created_at, locale)],
              ["پایان مهلت لغو", date(selected.cancel_until, locale)],
            ].map(([k, v]) => (
              <Localized key={k}><div>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div></Localized>
            ))}
          </dl>
          <Notice error={error} />
          <div className="portal-row" style={{ marginTop: 25 }}>
            {selected.paid_at && (
              <DownloadButton
                path={`orders/${selected.id}/invoice`}
                filename={`invoice-${selected.id}.pdf`}
              >
                دانلود فاکتور PDF
              </DownloadButton>
            )}
            {selected.status === "pending" &&
              selected.payment_method === "zarinpal" && (
                <button
                  disabled={busy}
                  className="portal-button primary"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const r = await api(
                        `orders/${selected.id}/payment`,
                        "POST",
                      );
                      window.location.assign(r.url);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  ادامهٔ پرداخت
                </button>
              )}
          </div>
          {["pending", "processing"].includes(selected.status) && (
            <div style={{ marginTop: 25 }}>
              <p className="portal-notice">
                وجه سفارش پرداخت‌شده پس از لغو به کیف پول برمی‌گردد. برای انتقال
                بانکی، درخواست برداشت ثبت کنید.
              </p>
              <Form
                fields={[
                  {
                    name: "consent",
                    label: "با بازگشت وجه به کیف پول موافقم",
                    type: "checkbox",
                  },
                ]}
                submit="لغو سفارش"
                onSubmit={async (d) => {
                  if (!d.consent)
                    throw new Error("موافقت با روش بازگشت وجه لازم است.");
                  const o = await api(`orders/${selected.id}/cancel`, "POST", {
                    walletRefundConsent: true,
                  });
                  setSelected(o);
                  onChange();
                }}
              />
            </div>
          )}
        </Modal>
      )}
    </></Localized>
  );
}
export function Wallet({
  refresh,
  onChange,
  user,
}: {
  refresh: number;
  onChange: () => void;
  user: RecordData;
}) {
  const s = useData("wallet", refresh),
    key = useRef(crypto.randomUUID());
  return (
    <Localized><DataState state={s}>
      {(d) => (
        <Localized><>
          <div className="portal-stats">
            <Stat label="قابل برداشت" value={d.wallet.available} />
            <Stat label="در انتظار تسویه" value={d.wallet.pending} />
            <Stat label="رزروشده برای برداشت" value={d.wallet.held} />
            <Stat label="بدهی برگشت پورسانت" value={d.wallet.debt} />
          </div>
          <div className="portal-card">
            <h2>درخواست برداشت</h2>
            {d.limits ? (
              <>
                <p>
                  حداقل {amount(d.limits.min)} و حداکثر {amount(d.limits.max)}{" "}
                  تومان برای هر درخواست
                </p>
                <Form
                  fields={[
                    {
                      name: "amount",
                      label: "مبلغ (تومان)",
                      type: "number",
                      min: d.limits.min,
                      max: Math.min(d.limits.max, d.wallet.available),
                    },
                    {
                      name: "iban",
                      label: "شماره شبا",
                      hint: "IR به همراه ۲۴ رقم؛ متعلق به صاحب حساب",
                    },
                    ...(user.twoFactor
                      ? [{ name: "totp", label: "کد دومرحله‌ای", max: 6 }]
                      : []),
                  ]}
                  submit="ثبت درخواست برداشت"
                  onSubmit={async (v) => {
                    await api("withdrawals", "POST", {
                      ...v,
                      idempotencyKey: key.current,
                    });
                    key.current = crypto.randomUUID();
                    onChange();
                  }}
                />
              </>
            ) : (
              <p className="portal-empty">
                برداشت پس از تعیین حدود مالی توسط مدیر فعال می‌شود.
              </p>
            )}
          </div>
          <div className="portal-card">
            <h2>تاریخچهٔ برداشت</h2>
            <Listing
              endpoint="withdrawals"
              refresh={refresh}
              columns={[
                ["amount", "مبلغ", "money"],
                ["status", "وضعیت", "status"],
                ["iban", "شبا"],
                ["reason", "توضیحات"],
                ["bank_reference", "مرجع بانکی"],
                ["created_at", "تاریخ", "date"],
              ]}
            />
          </div>
          <div className="portal-card">
            <h2>گردش دفتر مالی</h2>
            <Listing
              endpoint="wallet"
              refresh={refresh}
              columns={[
                ["kind", "رویداد"],
                ["available_delta", "تغییر موجودی", "money"],
                ["pending_delta", "تغییر در انتظار", "money"],
                ["held_delta", "تغییر رزرو", "money"],
                ["created_at", "تاریخ", "date"],
              ]}
            />
          </div>
        </></Localized>
      )}
    </DataState></Localized>
  );
}
export function Network({
  user,
  admin = false,
  refresh,
}: {
  user: RecordData;
  admin?: boolean;
  refresh: number;
}) {
  const [root, setRootValue] = useState(user.id),
    [page, setPage] = useState(1),
    [copy, setCopy] = useState("");
  const setRoot = (id: string) => {
    setRootValue(id);
    setPage(1);
  };
  const s = useData(
    (admin ? "admin/" : "") + "network?user=" + root + "&page=" + page,
    refresh,
  );
  const link =
    typeof window !== "undefined"
      ? window.location.origin + "/account?ref=" + user.referral_code
      : "";
  return (
    <Localized><>
      <div className="portal-card">
        <h2>{admin ? "مشاهدهٔ شبکه" : "دعوت به همای سعادت"}</h2>
        {admin ? (
          <Form
            fields={[{ name: "user", label: "شناسهٔ کاربر" }]}
            submit="نمایش شبکه"
            onSubmit={async (d) => setRoot(d.user)}
          />
        ) : (
          <>
            <p>
              کد معرف: <strong>{user.referral_code}</strong>
            </p>
            <div className="portal-code">{link}</div>
            <button
              className="portal-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopy("لینک کپی شد.");
                } catch {
                  setCopy("کپی خودکار ممکن نشد؛ لینک را انتخاب و کپی کنید.");
                }
              }}
            >
              کپی لینک دعوت
            </button>
            <p role="status">{copy}</p>
          </>
        )}
      </div>
      <DataState state={s}>
        {(d) => (
          <Localized><div className="portal-card">
            <div
              className="portal-row"
              style={{ justifyContent: "space-between" }}
            >
              <h2>شبکهٔ <span translate="no">{d.root.name}</span></h2>
              <button
                className="portal-button"
                onClick={() => setRoot(user.id)}
              >
                ریشهٔ من
              </button>
            </div>
            <p>{amount(d.successfulInvites)} عضو مستقیم ثبت‌نام‌شده</p>
            <p className="portal-notice">
              درخت معرف‌ها تا دو سطح نمایش داده می‌شود؛ برای ادامه روی نام عضو
              بزنید. پیش‌نمایش سطح دوم حداکثر ۳۰ نفر از هر عضو است. جایگاه
              باینری با چپ/راست مشخص شده است.
            </p>
            <div className="portal-tree">
              {d.nodes.length ? (
                d.nodes
                  .filter((n: RecordData) => n.depth === 1)
                  .map((n: RecordData) => (
                    <Localized key={n.id}><section>
                      <button onClick={() => setRoot(n.id)}>
                        <span translate="no">{n.name}</span> · {labels[n.leg] || "بدون جایگاه"}
                      </button>
                      {d.nodes
                        .filter((c: RecordData) => c.sponsor_id === n.id)
                        .map((c: RecordData) => (
                          <Localized key={c.id}><section>
                            <button onClick={() => setRoot(c.id)}>
                              <span translate="no">{c.name}</span> · {labels[c.leg] || "بدون جایگاه"}
                            </button>
                          </section></Localized>
                        ))}
                    </section></Localized>
                  ))
              ) : (
                <p className="portal-empty">زیرمجموعه‌ای ثبت نشده است.</p>
              )}
            </div>
            <Pagination page={page} more={d.hasMore} onChange={setPage} />
          </div></Localized>
        )}
      </DataState>
    </></Localized>
  );
}
export function Missions({ refresh }: { refresh: number }) {
  const s = useData("missions", refresh);
  return (
    <Localized><DataState state={s}>
      {(d) =>
        d.rows.length ? (
          d.rows.map((m: RecordData) => (
            <Localized key={m.id}><div className="portal-card">
              <h2>{m.title}</h2>
              <p>
                {labels[m.metric]}: {amount(m.progress)} از {amount(m.target)}
              </p>
              <div
                className="portal-progress"
                role="progressbar"
                aria-label={m.title}
                aria-valuenow={Math.min(
                  100,
                  Math.floor((m.progress * 100) / m.target),
                )}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span
                  style={{
                    width: Math.min(100, (m.progress * 100) / m.target) + "%",
                  }}
                />
              </div>
            </div></Localized>
          ))
        ) : (
          <Localized><p className="portal-empty">هنوز مأموریتی فعال نشده است.</p></Localized>
        )
      }
    </DataState></Localized>
  );
}
export function Profile({
  user,
  onChange,
}: {
  user: RecordData;
  onChange: () => Promise<void>;
}) {
  const [message, setMessage] = useState(""),
    [challenge, setChallenge] = useState(""),
    [target, setTarget] = useState(""),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false);
  return (
    <Localized><>
      <MemberDetails onChange={onChange} />
      <Notice success={message} error={error} />
      <div className="portal-card">
        <h2>اطلاعات و ترجیحات شما</h2>
        <p>
          {user.email || ""} {user.phone || ""}
        </p>
        <Form
          initial={{ name: user.name, ...user.preferences }}
          fields={[
            { name: "name", label: "نام و نام خانوادگی", full: true },
            { name: "email", label: "اعلان ایمیلی", type: "checkbox" },
            { name: "sms", label: "اعلان پیامکی", type: "checkbox" },
            { name: "inApp", label: "اعلان درون‌برنامه‌ای", type: "checkbox" },
          ]}
          onSubmit={async (d) => {
            await api("profile", "PATCH", {
              name: d.name,
              preferences: { email: d.email, sms: d.sms, inApp: d.inApp },
            });
            setMessage("تنظیمات ذخیره شد.");
            await onChange();
          }}
        />
      </div>
      <div className="portal-card">
        <h2>افزودن یا تغییر ایمیل / موبایل</h2>
        <label>
          گیرندهٔ جدید{" "}
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            style={{ padding: 10, border: "1px solid #cec1af" }}
          />
        </label>
        <button
          className="portal-button"
          disabled={sending}
          onClick={async () => {
            setSending(true);
            setError("");
            try {
              const r = await api("auth/otp", "POST", {
                target,
                purpose: "contact",
              });
              setChallenge(r.challenge);
              setMessage("کد به گیرندهٔ جدید ارسال شد.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setSending(false);
            }
          }}
        >
          ارسال کد
        </button>
        {challenge && (
          <Form
            fields={[
              { name: "password", label: "رمز عبور فعلی", type: "password" },
              { name: "code", label: "کد تأیید", max: 6 },
              ...(user.twoFactor
                ? [{ name: "totp", label: "کد برنامه رمزساز", max: 6 }]
                : []),
            ]}
            onSubmit={async (d) => {
              await api("contact", "POST", { ...d, target, challenge });
              setChallenge("");
              await onChange();
              setMessage("اطلاعات تماس تأیید و ذخیره شد.");
            }}
          />
        )}
      </div>
    </></Localized>
  );
}
export function Addresses({
  refresh,
  onChange,
}: {
  refresh: number;
  onChange: () => void;
}) {
  const s = useData("addresses", refresh),
    [edit, setEdit] = useState<RecordData | null>(null),
    [error, setError] = useState("");
  return (
    <Localized><>
      <Notice error={error} />
      <div className="portal-card">
        <h2>{edit ? "ویرایش آدرس" : "آدرس جدید"}</h2>
        <Form
          key={edit?.id || "new"}
          initial={edit || {}}
          fields={[
            { name: "label", label: "عنوان آدرس" },
            { name: "country", label: "کشور" },
            { name: "city", label: "شهر" },
            { name: "postal_code", label: "کد پستی" },
            {
              name: "address",
              label: "نشانی کامل",
              type: "textarea",
              full: true,
            },
          ]}
          onSubmit={async (d) => {
            await api("addresses", "POST", {
              ...d,
              ...(edit ? { id: edit.id } : {}),
            });
            setEdit(null);
            onChange();
          }}
        />
      </div>
      <DataState state={s}>
        {(d) => (
          <Localized><Table
            rows={d.rows}
            columns={[
              ["label", "عنوان"],
              ["city", "شهر"],
              ["address", "نشانی"],
              ["postal_code", "کد پستی"],
            ]}
            actions={(r) => (
              <Localized><>
                <button className="portal-button" onClick={() => setEdit(r)}>
                  ویرایش
                </button>
                <button
                  className="portal-button danger"
                  onClick={async () => {
                    try {
                      await api("addresses/" + r.id, "DELETE");
                      onChange();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  حذف
                </button>
              </></Localized>
            )}
          /></Localized>
        )}
      </DataState>
    </></Localized>
  );
}
export { default as Security } from "./SecurityPanel";
export function Subscriptions({
  refresh,
  onChange,
}: {
  refresh: number;
  onChange: () => void;
}) {
  const [error, setError] = useState(""),
    [selected, setSelected] = useState<RecordData | null>(null);
  const key = useRef(crypto.randomUUID());
  return (
    <Localized><>
      <Notice error={error} />
      <Listing
        endpoint="subscriptions"
        refresh={refresh}
        columns={[
          ["title", "پلن"],
          ["starts_at", "شروع", "date"],
          ["expires_at", "انقضا", "date"],
          ["cancelled", "لغوشده", "bool"],
        ]}
        actions={(r) => (
          <Localized><>
            <button className="portal-button" onClick={() => setSelected(r)}>
              تمدید / لغو
            </button>
          </></Localized>
        )}
      />
      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)}>
          <p className="portal-notice">
            تمدید با قیمت فعلی پلن و پرداخت جدید انجام می‌شود. لغو اشتراک دسترسی
            را متوقف می‌کند؛ برای بازگشت وجه در مهلت مجاز از بخش سفارش‌ها اقدام
            کنید.
          </p>
          <Form
            fields={[
              {
                name: "action",
                label: "انتخاب عملیات",
                type: "select",
                options: [
                  ["renew", "تمدید با درگاه بانکی"],
                  ["cancel", "لغو اشتراک"],
                ],
              },
            ]}
            submit="ادامه"
            onSubmit={async (d) => {
              if (d.action === "cancel") {
                await api("subscriptions", "PATCH", { id: selected.id });
                setSelected(null);
                onChange();
              } else {
                const o = await api("orders", "POST", {
                  productId: selected.product_id,
                  quantity: 1,
                  method: "zarinpal",
                  idempotencyKey: key.current,
                });
                const r = await api("orders/" + o.id + "/payment", "POST");
                window.location.assign(r.url);
              }
            }}
          />
        </Modal>
      )}
    </></Localized>
  );
}
export function Notifications({
  refresh,
  onChange,
}: {
  refresh: number;
  onChange: () => void;
}) {
  const [error, setError] = useState("");
  const mark = async (id?: string) => {
    try {
      await api("notifications", "PATCH", id ? { id } : { all: true });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Localized><>
      <Notice error={error} />
      <button
        className="portal-button"
        onClick={() => mark()}
        style={{ marginBottom: 20 }}
      >
        همه خوانده شدند
      </button>
      <Listing
        endpoint="notifications"
        refresh={refresh}
        columns={[
          ["title", "عنوان"],
          ["body", "پیام"],
          ["created_at", "تاریخ", "date"],
          ["read_at", "خوانده‌شده در", "date"],
        ]}
        actions={(r) =>
          !r.read_at && (
            <Localized><button className="portal-button" onClick={() => mark(r.id)}>
              خواندم
            </button></Localized>
          )
        }
      />
    </></Localized>
  );
}
