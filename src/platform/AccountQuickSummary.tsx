"use client";
import { ShoppingBag, Package, Headset, Presentation } from "@phosphor-icons/react";
import Localized from "../i18n/Localized";
import { amount, rialAmount, type RecordData } from "./client";
import { invitationCopy, invitationState } from "./invitation-state";

export function AccountQuickSummary({club,invitation,wallet,onNavigate}:{club:RecordData;invitation:RecordData;wallet:RecordData;onNavigate:(tab:string)=>void}) {
  const state=invitationState(invitation), copy=invitationCopy[state];
  return <Localized><section className="portal-card account-quick-summary" aria-label="خلاصه باشگاه و اقدام بعدی">
    <header><div><span>باشگاه مشتریان هما نت</span><h2>حساب شما در یک نگاه</h2></div><span className={"referral-state "+(state==="ready"?"on":"off")}>{copy.label}</span></header>
    <dl className="account-quick-stats">
      <div><dt>جایگاه فعال</dt><dd>{amount(club.desks)}<small> / ۷</small></dd></div>
      <div><dt>حجم باقی‌مانده چپ</dt><dd>{rialAmount(club.leftVolume)}<small> ریال</small></dd></div>
      <div><dt>حجم باقی‌مانده راست</dt><dd>{rialAmount(club.rightVolume)}<small> ریال</small></dd></div>
      <div><dt>موجودی قابل برداشت</dt><dd>{rialAmount(wallet.available)}<small> ریال</small></dd></div>
    </dl>
    <p className="account-cap-note">سقف مجموع هفتگی جایگاه‌های فعال: <strong>{rialAmount(club.weeklyCapToman)} ریال</strong></p>
    <p className="account-cap-explanation">این عدد سقف پاداش است؛ مبلغ قابل برداشت به حجم واجد شرایط، محاسبه و آزادسازی پاداش بستگی دارد.</p>
    <div className="account-next-step"><div><h3>اقدام بعدی شما</h3><p>{copy.text}</p></div><button type="button" className="portal-button" onClick={()=>onNavigate(state==="purchase_required"?"catalog":state==="blocked"?"tickets":"network")}>{state==="purchase_required"?"خرید و فعال‌سازی":state==="blocked"?"تماس با پشتیبانی":state==="placement_required"?"انتخاب محل ورود":"شبکه و دعوت"}</button></div>
    <nav className="account-action-grid" aria-label="دسترسی سریع حساب">
      <button type="button" onClick={()=>onNavigate("catalog")}><ShoppingBag size={22} aria-hidden="true"/><span>فروشگاه</span></button>
      <button type="button" onClick={()=>onNavigate("orders")}><Package size={22} aria-hidden="true"/><span>سفارش‌های من</span></button>
      <button type="button" onClick={()=>onNavigate("tickets")}><Headset size={22} aria-hidden="true"/><span>پشتیبانی</span></button>
      <button type="button" onClick={()=>onNavigate("member-kit")}><Presentation size={22} aria-hidden="true"/><span>ابزار معرفی</span></button>
    </nav>
    <details className="account-rules"><summary>حجم و پاداش چگونه حساب می‌شود؟</summary><ul><li>حجم چپ و راست، ماندهٔ واجد شرایط جایگاه اصلی برای تعادل است.</li><li>حجم هر جایگاه فقط از خریدهای پس از فعال‌سازی آن حساب می‌شود.</li><li>محاسبه پس از پایان مهلت برگشت خرید انجام می‌شود؛ پاداش محاسبه‌شده هفتهٔ بعد آزاد می‌شود.</li><li>مبلغ مازاد سقف هفتگی به هفتهٔ بعد منتقل نمی‌شود.</li></ul><button type="button" className="portal-button secondary" onClick={()=>onNavigate("commissions")}>مشاهده سابقه پورسانت</button></details>
  </section></Localized>;
}
