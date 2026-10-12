"use client";
import { useRef, useState } from "react";
import Localized from "../i18n/Localized";
import { api, date, type RecordData } from "./client";
import { DataState, Form, Notice, Pagination, useData } from "./Widgets";
import { outboxErrors } from "./outbox-model";

export default function AdminOutbox({
  refresh,
  onChange,
}: {
  refresh: number;
  onChange: () => void;
}) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<RecordData | null>(null);
  const [notice, setNotice] = useState("");
  const pending = useRef(false);
  const state = useData("admin/outbox?page=" + page, refresh);
  return (
    <Localized>
      <section className="portal-card">
        <h2>رسیدگی به اعلان‌های ناموفق</h2>
        <p>
          اعلان‌های در صف به‌صورت خودکار پیگیری می‌شوند. پس از پایان تلاش‌ها،
          حداکثر سه تلاش دستی برای همان گیرنده و با ثبت دلیل ممکن است.
        </p>
        <button type="button" className="portal-button" onClick={state.retry}>
          تازه‌سازی وضعیت اعلان‌ها
        </button>
        <Notice success={notice} />
        <DataState state={state}>
          {(d) => (
            <>
              {!d.rows.length && <p>اعلان نیازمند بررسی وجود ندارد.</p>}
              {d.rows.map((job: RecordData) => (
                <article className="portal-card" key={job.id}>
                  <h3>
                    {job.channel === "sms" ? "پیامک" : "ایمیل"} ·{" "}
                    <bdi translate="no">{job.target}</bdi>
                  </h3>
                  <p>
                    {outboxErrors[job.error] || outboxErrors.delivery_failed}
                  </p>
                  <p>
                    تعداد تلاش: {job.attempts} · {date(job.createdAt)}
                  </p>
                  <p>
                    {job.status === "cancelled"
                      ? "ارسال لغو شده است."
                      : job.canRetry
                        ? "تلاش خودکار پایان یافته است."
                        : "در صف ارسال یا نیازمند بررسی وضعیت گیرنده و سابقه تلاش‌ها"}
                  </p>
                  {job.canRetry && (
                    <button
                      type="button"
                      className="portal-button"
                      onClick={() => {
                        setSelected(job);
                        setNotice("");
                      }}
                    >
                      بررسی برای تلاش مجدد
                    </button>
                  )}
                  {selected?.id === job.id && (
                    <div>
                      <p>
                        ابتدا علت خطا را رفع و سابقه ارسال را در پنل ارائه‌دهنده
                        بررسی کنید. دریافت‌نشدن پاسخ ممکن است با ارسال موفق
                        همراه باشد؛ تلاش مجدد احتمال پیام تکراری دارد.
                      </p>
                      <Form
                        key={job.id + ":" + job.attempts}
                        fields={[
                          { name: "reason", label: "دلیل تلاش مجدد", max: 200 },
                          {
                            name: "checkedDelivery",
                            label:
                              "سابقه ارسال را بررسی کردم و احتمال ارسال تکراری را می‌پذیرم.",
                            type: "checkbox",
                          },
                        ]}
                        submit="ثبت یک تلاش مجدد"
                        onSubmit={async (v) => {
                          if (pending.current) return;
                          pending.current = true;
                          try {
                            await api("admin/outbox", "POST", {
                              ...v,
                              id: job.id,
                              attempts: job.attempts,
                            });
                            setSelected(null);
                            setNotice(
                              "یک تلاش مجدد در صف ثبت شد؛ نتیجه ارسال پس از پردازش مشخص می‌شود.",
                            );
                            onChange();
                            state.retry();
                          } finally {
                            pending.current = false;
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="portal-button"
                        onClick={() => setSelected(null)}
                      >
                        انصراف
                      </button>
                    </div>
                  )}
                </article>
              ))}
              <Pagination
                page={page}
                more={d.hasMore}
                onChange={(n) => {
                  setPage(n);
                  setSelected(null);
                }}
              />
            </>
          )}
        </DataState>
      </section>
    </Localized>
  );
}
