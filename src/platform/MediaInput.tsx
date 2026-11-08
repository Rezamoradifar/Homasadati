"use client";

import Localized from "../i18n/Localized";
import { useState } from "react";
import { errors } from "./client";
import { safeMediaSrc } from "../components/media/retired-image-aliases";
export function MediaInput({
  name,
  initial,
  single = false,
}: {
  name: string;
  initial: string;
  single?: boolean;
}) {
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const urls=value.split("\n").map(v=>v.trim()).filter(Boolean);
  const move=(src:string)=>{const index=urls.indexOf(src);if(index<0)return;setValue([src,...urls.filter((_,i)=>i!==index)].join("\n"));};
  const remove=(src:string)=>setValue(urls.filter(v=>v!==src).join("\n"));
  return (
    <Localized><span className="portal-media-input" data-uploading={busy}>
      <textarea
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={single ? 1000 : 12000}
      />
      <span className="portal-upload-action">
        بارگذاری تصویر از دستگاه (JPEG، PNG، WebP؛ حداکثر ۸ مگابایت)
      </span>
      <input
        aria-label={single ? "بارگذاری تصویر محتوا" : "بارگذاری تصویر محصول"}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={async (e) => {
          const input = e.currentTarget,
            file = input.files?.[0];
          if (!file) return;
          setError("");
          if (file.size > 8 * 1024 * 1024) {
            setError("حجم تصویر نباید بیشتر از ۸ مگابایت باشد.");
            input.value = "";
            return;
          }
          if (!single && value.split("\n").filter((v) => v.trim()).length >= 12) {
            setError("حداکثر ۱۲ تصویر برای محصول مجاز است.");
            input.value = "";
            return;
          }
          setBusy(true);
          try {
            const response = await fetch("/api/platform/media", {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": file.type },
              body: file,
            });
            const result = await response.json();
            if (!response.ok)
              throw new Error(
                errors[result.error] || "بارگذاری تصویر انجام نشد.",
              );
            setValue((v) => single ? result.url : [v.trim(), result.url].filter(Boolean).join("\n"));
          } catch (err) {
            setError(
              err instanceof TypeError
                ? "ارتباط شبکه قطع است؛ دوباره تلاش کنید."
                : (err as Error).message,
            );
          } finally {
            setBusy(false);
            input.value = "";
          }
        }}
      />
      {busy && <span role="status">در حال بارگذاری تصویر…</span>}
      {error && (
        <span role="alert" className="portal-error">
          {error}
        </span>
      )}
      <span className="portal-media-thumbs">
        {value
          .split("\n")
          .map((v) => v.trim())
          .filter(
            (v) =>
              v.startsWith("/api/platform/media/") ||
              v.startsWith("/assets/") ||
              v.startsWith("https://"),
          )
          .slice(0, 12)
          .map((src, i) => (
            <Localized key={src+i}><span className="media-edit-thumb"><img src={safeMediaSrc(src)} alt={`تصویر ${i + 1}`} loading="lazy" /><span>{!single && <button type="button" disabled={busy||i===0} onClick={()=>move(src)}>{i===0?"تصویر اصلی":"اصلی شود"}</button>}<button type="button" disabled={busy} onClick={()=>remove(src)}>حذف تصویر</button></span></span></Localized>
          ))}
      </span>
      <small>
        {single ? "بارگذاری تصویر جدید، تصویر انتخاب‌شده را جایگزین می‌کند؛ حذف از فرم فایل ذخیره‌شده را پاک نمی‌کند." : "تصویر اصلی را با دکمه انتخاب کنید؛ حذف تصویر از این فرم، فایل ذخیره‌شده را پاک نمی‌کند."}
      </small>
    </span></Localized>
  );
}
