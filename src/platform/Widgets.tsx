"use client";
import { MediaInput } from "./MediaInput";
import { useEffect, useRef, useState, ReactNode } from "react";
import { api, amount, date, labels, RecordData } from "./client";
export interface Field {
  name: string;
  label: string;
  sectors?: string[];
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: [string, string][];
  hint?: string;
  full?: boolean;
}
export function Form({
  fields,
  initial = {},
  onSubmit,
  submit = "ذخیره",
  resetOnSuccess = false,
}: {
  fields: Field[];
  initial?: RecordData;
  onSubmit: (d: RecordData) => Promise<void>;
  submit?: string;
  resetOnSuccess?: boolean;
}) {
  const [sector, setSector] = useState(String(initial.vertical || ""));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="portal-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = e.currentTarget;
        if (form.querySelector('[data-uploading="true"]')) {
          setError("تا پایان بارگذاری تصویر صبر کنید.");
          return;
        }
        const f = new FormData(form);
        const d: RecordData = {};
        for (const field of fields) {
          if (
            field.type === "section" ||
            (field.sectors && !field.sectors.includes(sector))
          )
            continue;
          const raw = f.get(field.name);
          d[field.name] =
            field.type === "multiselect"
              ? f.getAll(field.name).map(String)
              : field.type === "checkbox"
                ? raw === "on"
                : field.type === "number"
                  ? Number(raw)
                  : String(raw ?? "").trim();
        }
        setBusy(true);
        setError("");
        try {
          await onSubmit(d);
          if (resetOnSuccess) form.reset();
        } catch (err) {
          setError(err instanceof Error ? err.message : "عملیات انجام نشد.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} style={{ display: "contents" }}>
        {fields
          .filter((f) => !f.sectors || f.sectors.includes(sector))
          .map((f) =>
            f.type === "section" ? (
              <h3 className="portal-form-section" key={f.name}>
                {f.label}
              </h3>
            ) : (
              <label
                key={f.name}
                className={
                  (f.full ? "full " : "") +
                  (f.type === "checkbox" ? "check" : "")
                }
              >
                {f.label}
                {f.type === "media" ? (
                  <MediaInput name={f.name} initial={initial[f.name] || ""} />
                ) : f.type === "textarea" ? (
                  <textarea
                    name={f.name}
                    required={f.required !== false}
                    defaultValue={initial[f.name] ?? ""}
                    maxLength={f.max ?? 8000}
                  />
                ) : ["select", "multiselect"].includes(f.type || "") ? (
                  <select
                    name={f.name}
                    onChange={
                      f.name === "vertical"
                        ? (e) => setSector(e.target.value)
                        : undefined
                    }
                    multiple={f.type === "multiselect"}
                    size={f.type === "multiselect" ? 6 : undefined}
                    defaultValue={
                      f.type === "multiselect"
                        ? initial[f.name] || []
                        : String(initial[f.name] ?? "")
                    }
                    required={f.required !== false}
                  >
                    {f.type !== "multiselect" && (
                      <option value="">انتخاب کنید</option>
                    )}
                    {f.options?.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                ) : f.type === "checkbox" ? (
                  <input
                    type="checkbox"
                    name={f.name}
                    defaultChecked={!!initial[f.name]}
                  />
                ) : (
                  <input
                    name={f.name}
                    type={f.type || "text"}
                    defaultValue={initial[f.name] ?? ""}
                    required={f.required !== false}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    minLength={f.type === "password" ? 12 : undefined}
                    maxLength={f.type === "number" ? undefined : (f.max ?? 254)}
                    dir={
                      ["email", "number", "password", "url"].includes(
                        f.type || "",
                      )
                        ? "ltr"
                        : undefined
                    }
                  />
                )}{" "}
                {f.hint && <small>{f.hint}</small>}
              </label>
            ),
          )}
        {error && (
          <div role="alert" className="portal-error full">
            {error}
          </div>
        )}
        <div className="full">
          <button disabled={busy} className="portal-button primary">
            {busy ? "در حال انجام…" : submit}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
export function Notice({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  return (
    <>
      {error && (
        <div className="portal-error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="portal-success" role="status">
          {success}
        </div>
      )}
    </>
  );
}
export function useData(path: string, refresh = 0) {
  const [data, setData] = useState<RecordData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const previous = useRef("");
  useEffect(() => {
    let current = true;
    if (previous.current !== path) {
      setLoading(true);
      setData(null);
      previous.current = path;
    }
    setError("");
    api(path)
      .then((d) => {
        if (current) setData(d);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [path, refresh]);
  return { data, error, loading };
}
export function DataState({
  state,
  children,
}: {
  state: ReturnType<typeof useData>;
  children: (d: RecordData) => ReactNode;
}) {
  if (state.loading)
    return (
      <p role="status" className="portal-loading">
        در حال دریافت اطلاعات…
      </p>
    );
  if (state.error) return <Notice error={state.error} />;
  return state.data ? <>{children(state.data)}</> : null;
}
export const status = (s: unknown) => (
  <span
    className={
      "portal-tag " +
      (["paid", "available", "delivered", "approved"].includes(String(s))
        ? "green"
        : ["refunded", "cancelled", "rejected", "reversed"].includes(String(s))
          ? "red"
          : "")
    }
  >
    {labels[String(s)] || String(s)}
  </span>
);
export function Table({
  rows,
  columns,
  actions,
}: {
  rows: RecordData[];
  columns: [string, string, string?][];
  actions?: (r: RecordData) => ReactNode;
}) {
  if (!rows.length)
    return <p className="portal-empty">هنوز موردی ثبت نشده است.</p>;
  return (
    <div className="portal-table-wrap">
      <table className="portal-table">
        <thead>
          <tr>
            {columns.map(([k, l]) => (
              <th key={k}>{l}</th>
            ))}
            {actions && <th>عملیات</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || r.day || i}>
              {columns.map(([k, , type]) => (
                <td key={k} title={String(r[k] ?? "")}>
                  {type === "money"
                    ? amount(r[k])
                    : type === "date"
                      ? date(r[k])
                      : type === "status"
                        ? status(r[k])
                        : type === "bool"
                          ? r[k]
                            ? "بله"
                            : "خیر"
                          : labels[r[k]] || String(r[k] ?? "—")}
                </td>
              ))}
              {actions && (
                <td>
                  <div className="portal-row">{actions(r)}</div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Stat({
  label,
  value,
  unit = "تومان",
}: {
  label: string;
  value: unknown;
  unit?: string;
}) {
  return (
    <div className="portal-stat">
      <small>{label}</small>
      <strong>{value === null || value === "—" ? "—" : amount(value)}</strong>
      <em>{unit}</em>
    </div>
  );
}
export function Filter({
  onChange,
  vertical = false,
  dates = false,
  kind = false,
  statuses,
}: {
  onChange: (q: string) => void;
  vertical?: boolean;
  dates?: boolean;
  kind?: boolean;
  statuses?: string[];
}) {
  return (
    <form
      className="portal-filter"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const q = new URLSearchParams();
        for (const [k, v] of f) if (v) q.set(k, String(v));
        onChange(q.toString());
      }}
    >
      <label>
        جستجو
        <input name="q" placeholder="نام یا شناسه" maxLength={200} />
      </label>
      {vertical && (
        <label>
          حوزه
          <select name="vertical">
            <option value="">همهٔ حوزه‌ها</option>
            {["tourism", "beauty", "craft", "ai", "leather"].map((v) => (
              <option key={v} value={v}>
                {labels[v]}
              </option>
            ))}
          </select>
        </label>
      )}
      {statuses && (
        <label>
          وضعیت
          <select name="status">
            <option value="">همه</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {labels[s]}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind && (
        <label>
          نوع پورسانت
          <select name="kind">
            <option value="">همه</option>
            {["direct", "level", "binary", "rank"].map((v) => (
              <option key={v} value={v}>
                {labels[v]}
              </option>
            ))}
          </select>
        </label>
      )}
      {dates && (
        <>
          <label>
            از تاریخ
            <input type="date" name="from" />
          </label>
          <label>
            تا تاریخ
            <input type="date" name="to" />
          </label>
        </>
      )}
      <button className="portal-button">اعمال فیلتر</button>
    </form>
  );
}
export function Pagination({
  page,
  more,
  onChange,
}: {
  page: number;
  more: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div className="portal-pagination">
      <button
        className="portal-button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        قبلی
      </button>
      <span>صفحهٔ {amount(page)}</span>
      <button
        className="portal-button"
        disabled={!more}
        onClick={() => onChange(page + 1)}
      >
        بعدی
      </button>
    </div>
  );
}
export function Listing({
  endpoint,
  refresh,
  columns,
  actions,
  filters,
}: {
  endpoint: string;
  refresh: number;
  columns: [string, string, string?][];
  actions?: (r: RecordData) => ReactNode;
  filters?: {
    vertical?: boolean;
    dates?: boolean;
    kind?: boolean;
    statuses?: string[];
  };
}) {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1);
  const state = useData(endpoint + "?" + q + "&page=" + page, refresh);
  return (
    <>
      <Filter
        {...filters}
        onChange={(v) => {
          setQ(v);
          setPage(1);
        }}
      />
      <DataState state={state}>
        {(d) => (
          <>
            <Table rows={d.rows} columns={columns} actions={actions} />
            <Pagination page={page} more={d.hasMore} onChange={setPage} />
          </>
        )}
      </DataState>
    </>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      className="portal-dialog"
      ref={ref}
      onCancel={onClose}
      style={{
        border: "1px solid #c4cdbd",
        borderRadius: 8,
        padding: 28,
        width: "min(760px,calc(100% - 30px))",
        maxHeight: "90vh",
        color: "#254331",
        background: "#fff",
      }}
    >
      <div
        className="portal-row"
        style={{ justifyContent: "space-between", marginBottom: 20 }}
      >
        <h2>{title}</h2>
        <button className="portal-button" onClick={onClose} aria-label="بستن">
          بستن
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function DownloadButton({
  path,
  filename,
  children,
}: {
  path: string;
  filename: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div>
      <button
        className="portal-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/platform/" + path, {
              credentials: "same-origin",
              cache: "no-store",
            });
            if (!response.ok)
              throw new Error(
                "دریافت فایل انجام نشد؛ دسترسی و اتصال را بررسی کنید.",
              );
            const url = URL.createObjectURL(await response.blob());
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "ارتباط شبکه برقرار نشد.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "در حال دریافت…" : children}
      </button>
      {error && (
        <p role="alert" className="portal-error">
          {error}
        </p>
      )}
    </div>
  );
}
