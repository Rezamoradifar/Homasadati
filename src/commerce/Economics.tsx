"use client";
import { useState } from "react";
export default function Economics() {
  const [v, set] = useState<Record<string, string>>({
    price: "",
    variable: "",
    fixed: "",
    orders: "",
  });
  const complete =
    Object.values(v).every(
      (x) =>
        x.trim() !== "" &&
        Number.isFinite(Number(x)) &&
        Number(x) >= 0 &&
        Number(x) <= 1e12,
    ) && Number.isInteger(Number(v.orders));
  const contribution = Number(v.price) - Number(v.variable);
  const format = (n: number) =>
    n.toLocaleString("fa-IR", { maximumFractionDigits: 0 });
  return (
    <section className="economics" aria-labelledby="economic-calculator">
      <div>
        <span className="commerce-eyebrow">تصمیم با فرض‌های خود شما</span>
        <h2 id="economic-calculator">آیا مدل فروش شما اقتصادی است؟</h2>
        <p>
          ارقام واقعی کسب‌وکارتان را وارد کنید. هیچ نرخ سود یا فروش فرضی از پیش
          قرار داده نشده است. محاسبه زیر یک تحلیل ساده عملیاتی است، نه پیش‌بینی
          بازده.
        </p>
      </div>
      <div className="economic-inputs">
        {[
          ["price", "درآمد هر سفارش (تومان)"],
          ["variable", "هزینه متغیر هر سفارش (تومان)"],
          ["fixed", "هزینه ثابت ماهانه (تومان)"],
          ["orders", "تعداد سفارش ماهانه"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min="0"
              max="1000000000000"
              step="1"
              value={v[key]}
              onChange={(e) => set({ ...v, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <p>
        هزینه متغیر شامل خرید یا تولید، کارمزد، سهم پورسانت، ارسال، مرجوعی مورد
        انتظار و مالیات مرتبط است؛ هزینه ثابت شامل حقوق، اجاره، زیرساخت و
        بازاریابی ثابت می‌شود. جریان نقدی و سرمایه در گردش باید جداگانه بررسی
        شوند.
      </p>
      <div aria-live="polite" className="economic-result">
        {complete ? (
          <>
            <p>
              حاشیه مشارکت هر سفارش:{" "}
              <strong>{format(contribution)} تومان</strong>
            </p>
            <p>
              مازاد / کسری عملیاتی ماهانه:{" "}
              <strong>
                {format(contribution * Number(v.orders) - Number(v.fixed))}{" "}
                تومان
              </strong>
            </p>
            <p>
              نقطه سربه‌سر:{" "}
              <strong>
                {contribution > 0
                  ? format(Math.ceil(Number(v.fixed) / contribution)) +
                    " سفارش در ماه"
                  : "با حاشیه صفر یا منفی قابل دستیابی نیست"}
              </strong>
            </p>
          </>
        ) : (
          <p>برای محاسبه، هر چهار مقدار معتبر را وارد کنید.</p>
        )}
      </div>
      <small>
        فرمول: (درآمد هر سفارش − هزینه متغیر آن) × تعداد سفارش − هزینه ثابت
        ماهانه.
      </small>
    </section>
  );
}
