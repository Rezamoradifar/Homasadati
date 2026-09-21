"use client";
import { useState } from "react";
export function RecoveryCodes({
  codes,
  onContinue,
}: {
  codes: string[];
  onContinue: () => void;
}) {
  const [saved, setSaved] = useState(false),
    [copied, setCopied] = useState(false);
  return (
    <section className="recovery-codes" aria-labelledby="recovery-heading">
      <p className="auth-eyebrow">حفاظت از دسترسی شما</p>
      <h2 id="recovery-heading">کدهای بازیابی را نگه دارید</h2>
      <p>
        ورود دومرحله‌ای فعال است. اگر به رمزساز دسترسی نداشتید، یکی از این کدها
        را همراه رمز عبور وارد کنید. هر کد فقط یک‌بار قابل استفاده است و این
        فهرست دوباره نمایش داده نمی‌شود.
      </p>
      <div className="recovery-grid" dir="ltr">
        {codes.map((code) => (
          <code key={code}>{code}</code>
        ))}
      </div>
      <div className="auth-actions">
        <button
          type="button"
          className="portal-button secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(codes.join("\n"));
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "کپی شد" : "کپی کدها"}
        </button>
        <button
          type="button"
          className="portal-button secondary"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  "HOMA — Recovery codes\nKeep private. Each code works once.\n\n" +
                    codes.join("\n"),
                ],
                { type: "text/plain;charset=utf-8" },
              ),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "homa-recovery-codes.txt";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          دریافت فایل کدها
        </button>
      </div>
      <label className="auth-check">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        کدها را در محل امنی جدا از دستگاه رمزساز نگه داشته‌ام.
      </label>
      <button className="portal-button" disabled={!saved} onClick={onContinue}>
        ادامه
      </button>
    </section>
  );
}
