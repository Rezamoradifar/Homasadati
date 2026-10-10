"use client";
import Localized from "../i18n/Localized";
import { amount, type RecordData } from "./client";
import { invitationCopy, invitationState } from "./invitation-state";

export function AccountQuickSummary({club,invitation,wallet,onNavigate}:{club:RecordData;invitation:RecordData;wallet:RecordData;onNavigate:(tab:string)=>void}) {
  const state=invitationState(invitation), copy=invitationCopy[state];
  return <Localized><section className="portal-card account-quick-summary" aria-label="خلاصه باشگاه و اقدام بعدی">
    <header><div><span>باشگاه مشتریان هما نت</span><h2>حساب شما در یک نگاه</h2></div><span className={"referral-state "+(state==="ready"?"on":"off")}>{copy.label}</span></header>
    <dl className="account-quick-stats">
      <div><dt>جایگاه فعال</dt><dd>{amount(club.desks)}<small> / ۷</small></dd></div>
      <div><dt>حجم باقی‌مانده چپ</dt><dd>{amount(club.leftVolume)}<small> تومان</small></dd></div>
      <div><dt>حجم باقی‌مانده راست</dt><dd>{amount(club.rightVolume)}<small> تومان</small></dd></div>
      <div><dt>موجودی قابل برداشت</dt><dd>{amount(wallet.available)}<small> تومان</small></dd></div>
    </dl>
    <p className="account-cap-note">سقف مجموع هفتگی جایگاه‌های فعال: <strong>{amount(club.weeklyCapToman)} تومان</strong></p>
    <p className="account-cap-explanation">این عدد سقف پاداش است؛ مبلغ قابل برداشت به حجم واجد شرایط، محاسبه و آزادسازی پاداش بستگی دارد.</p>
    <div className="account-next-step"><div><h3>اقدام بعدی شما</h3><p>{copy.text}</p></div><button type="button" className="portal-button" onClick={()=>onNavigate(state==="purchase_required"?"catalog":state==="blocked"?"tickets":"network")}>{state==="purchase_required"?"خرید و فعال‌سازی":state==="blocked"?"تماس با پشتیبانی":state==="placement_required"?"انتخاب محل ورود":"شبکه و دعوت"}</button></div>
    <details className="account-rules"><summary>حجم و پاداش چگونه حساب می‌شود؟</summary><ul><li>حجم چپ و راست، ماندهٔ واجد شرایط جایگاه اصلی برای تعادل است.</li><li>حجم هر جایگاه فقط از خریدهای پس از فعال‌سازی آن حساب می‌شود.</li><li>محاسبه پس از پایان مهلت برگشت خرید انجام می‌شود؛ پاداش محاسبه‌شده هفتهٔ بعد آزاد می‌شود.</li><li>مبلغ مازاد سقف هفتگی به هفتهٔ بعد منتقل نمی‌شود.</li></ul><button type="button" className="portal-button secondary" onClick={()=>onNavigate("commissions")}>مشاهده سابقه پورسانت</button></details>
  </section></Localized>;
}
