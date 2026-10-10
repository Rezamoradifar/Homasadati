"use client";
import Localized from "../i18n/Localized";
import { amount } from "./client";
import { DataState, useData } from "./Widgets";
const pages:Record<string,string>={home:"صفحه اصلی",account:"حساب کاربری",admin:"مدیریت",register:"ثبت‌نام",shop:"فروشگاه",cart:"سبد خرید",checkout:"نهایی‌کردن خرید",payment:"نتیجه پرداخت",other:"سایر صفحات"};
const kinds:Record<string,string>={navigation:"بارگذاری صفحه",ttfb:"اولین پاسخ سرور",lcp:"نمایش محتوای اصلی",api_slow:"پاسخ کند پنل",api_network:"قطع ارتباط پنل",api_timeout:"پایان زمان انتظار پنل",api_server:"خطای سرور پنل",api_invalid:"پاسخ ناخوانای پنل",runtime:"خطای اجرای صفحه",resource:"خطای دریافت فایل صفحه"};
export function SiteExperiencePanel({refresh}:{refresh:number}) {
  const s=useData("admin/site-experience",refresh);
  return <Localized><section className="portal-card site-experience-panel"><h2>سرعت و خطاهای کاربران</h2><p>مشاهدات ناشناس مرورگر در ۱۴ روز اخیر؛ تعداد نمونه، تعداد کاربر نیست. میانگین زمان به میلی‌ثانیه است.</p>
    <DataState state={s}>{d=><><div className="experience-signals"><h3>سرنخ‌های بررسی کندی</h3><ul>{d.rows.some((r:any)=>r.kind==='ttfb'&&r.slow>0)&&<li>پاسخ اولیه کند ثبت شده است؛ مسیر اتصال، کلادفلر و پاسخ سرور را بررسی کنید.</li>}{d.rows.some((r:any)=>r.kind==='lcp'&&r.slow>0)&&<li>نمایش محتوای اصلی کند است؛ اندازه تصاویر و فایل‌های صفحه را بررسی کنید.</li>}{d.rows.some((r:any)=>['api_timeout','api_network','api_server','resource'].includes(r.kind))&&<li>خطای ارتباط یا دریافت فایل ثبت شده است؛ وضعیت سرور و اتصال کاربران را بررسی کنید.</li>}</ul><p>این موارد سرنخ هستند؛ علت قطعی از این نمونه‌ها به‌تنهایی مشخص نمی‌شود.</p></div>{d.rows.length ? <div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>صفحه</th><th>شاخص</th><th>نمونه</th><th>میانگین زمان</th><th>بیشترین زمان</th><th>نمونه کند</th></tr></thead><tbody>{d.rows.map((r:any)=><tr key={r.page+r.kind}><td>{pages[r.page]}</td><td>{kinds[r.kind]}</td><td>{amount(r.samples)}</td><td>{r.kind==="runtime"||r.kind==="resource"?"—":amount(r.averageMs)}</td><td>{r.kind==="runtime"||r.kind==="resource"?"—":amount(r.maxMs)}</td><td>{amount(r.slow)}</td></tr>)}</tbody></table></div> : <p className="portal-empty">هنوز نمونه‌ای ثبت نشده است؛ پس از بازدید کاربران، گزارش نمایش داده می‌شود.</p>}</>}</DataState>
    <p className="portal-notice">کند: اولین پاسخ بیش از ۸۰۰، محتوای اصلی بیش از ۲۵۰۰ و بارگذاری بیش از ۴۰۰۰ میلی‌ثانیه. این گزارش قطعی قبل از اجرای صفحه را پوشش نمی‌دهد و جای پایش مستقل سرور را نمی‌گیرد.</p>
  </section></Localized>;
}
