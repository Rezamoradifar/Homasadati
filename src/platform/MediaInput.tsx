"use client";
import { useState } from "react";
import { errors } from "./client";
export function MediaInput({
  name,
  initial,
}: {
  name: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <span className="portal-media-input" data-uploading={busy}>
      <textarea
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={12000}
      />
      <span className="portal-upload-action">
        بارگذاری تصویر از دستگاه (JPEG، PNG، WebP؛ حداکثر ۸ مگابایت)
      </span>
      <input
        aria-label="بارگذاری تصویر محصول"
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
          if (value.split("\n").filter((v) => v.trim()).length >= 12) {
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
            setValue((v) => [v.trim(), result.url].filter(Boolean).join("\n"));
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
            <img key={i} src={src} alt={`تصویر ${i + 1}`} loading="lazy" />
          ))}
      </span>
      <small>
        اولین تصویر، تصویر اصلی است. برای حذف یا تغییر ترتیب، خطوط نشانی‌ها را
        ویرایش کنید.
      </small>
    </span>
  );
}
