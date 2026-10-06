"use client";
import { Check, LockSimple, Clock, Wallet, Gift, TreeStructure, ArrowLeft } from "@phosphor-icons/react";
import Localized from "../i18n/Localized";
import { sevenCards, DESKS_PER_MEMBER, PURCHASE_PER_DESK } from "./card-levels";
import { amount, RecordData } from "./client";
import { DataState, useData } from "./Widgets";

export function ClubAccountCard({ status, available = 0, onNavigate }: {
  status: RecordData; available?: number; onNavigate?: (tab: string) => void;
}) {
  const desks = Math.max(0, Math.min(DESKS_PER_MEMBER, Number(status.desks) || 0));
  const total = Math.max(0, Number(status.totalPurchase) || 0);
  const complete = desks === DESKS_PER_MEMBER;
  const remaining = complete ? 0 : Math.max(0, (desks + 1) * PURCHASE_PER_DESK - total);
  const progress = complete ? 100 : Math.min(100, Math.max(0, (total - desks * PURCHASE_PER_DESK) / PURCHASE_PER_DESK * 100));
  const card = sevenCards.find((item) => item.level === Number(status.level));
  return <Localized><section className="club-account" aria-label="باشگاه من">
    <header className="club-account-header"><h2>باشگاه من</h2><img src="/assets/brand/homanet-mark-orange.png" alt="هما نت" width="44" height="44" /></header>
    <div className="club-membership">
      <div className="club-membership-brand"><div><span>باشگاه مشتریان</span><strong>همانتس</strong><span lang="en" translate="no">HOMANETS</span></div><img src="/assets/brand/homanet-mark-orange.png" alt="" width="116" height="116" /></div>
      <div className="club-membership-level"><span>کارت</span><strong>{card?.name || "هنوز فعال نشده"}</strong></div>
    </div>
    {!status.live && <p className="club-account-notice" role="status">تسویهٔ این پلن هنوز فعال نشده است.</p>}
    <section className="club-slot-section"><h3>جایگاه‌های عضویت</h3><ol className="club-slots" aria-label="وضعیت هفت جایگاه">
      {Array.from({ length: DESKS_PER_MEMBER }, (_, i) => <li key={i} className={i < desks ? "is-active" : ""} aria-label={`جایگاه ${i + 1}: ${i < desks ? "روشن" : "خاموش"}`}><span className="club-slot-icon">{i < desks ? <Check size={22} weight="bold" /> : <LockSimple size={20} />}</span><span>{amount(i + 1)}</span><span className="club-slot-state">{i < desks ? "روشن" : "خاموش"}</span></li>)}
    </ol></section>
    <section className="club-purchase-progress"><div><span>پیشرفت تا جایگاه بعدی</span><strong>{complete ? "همهٔ جایگاه‌ها روشن هستند" : <>{amount(remaining)} تومان تا جایگاه بعدی</>}</strong></div><progress value={progress} max={100} aria-label="پیشرفت تا جایگاه بعدی" /><div><span>مجموع خرید محاسبه‌شده</span><strong>{amount(total)} <small>تومان</small></strong></div><div className="club-paid-total"><span>خرید پرداخت‌شده</span><strong>{amount(status.paidPurchaseTotal || 0)} <small>تومان</small></strong></div><div className="club-weekly-cap"><span>سقف هفتگی جایگاه‌های روشن</span><strong>{amount(status.weeklyCapToman || 0)} <small>تومان</small></strong></div></section>
    <section className="club-balances" aria-label="وضعیت پورسانت‌ها">
      <div><span className="club-balance-label"><Clock size={23} />در انتظار پرداخت</span><strong>{amount(status.pendingRewards || 0)} <small>تومان</small></strong></div>
      <div><span className="club-balance-label"><Wallet size={23} />قابل برداشت</span><strong>{amount(available)} <small>تومان</small></strong></div>
      <div><span className="club-balance-label"><Gift size={23} />ووچر خرید</span><strong>{amount(status.voucherBalance || 0)} <small>تومان</small></strong></div>
      <p>پورسانت محاسبه‌شده، هفتهٔ بعد آزاد می‌شود.</p>
    </section>
    <div className="club-actions">{onNavigate ? <><button type="button" onClick={() => onNavigate("catalog")}>تکمیل خرید<ArrowLeft size={20} /></button><button type="button" className="club-action-secondary" onClick={() => onNavigate("network")}><TreeStructure size={20} />مشاهده درخت</button></> : <><a href="?tab=catalog">تکمیل خرید<ArrowLeft size={20} /></a><a href="?tab=network" className="club-action-secondary"><TreeStructure size={20} />مشاهده درخت</a></>}</div>
  </section></Localized>;
}
export function ClubAccountOverview({ refresh, available, onNavigate }: { refresh: number; available: number; onNavigate: (tab: string) => void }) {
  const state = useData("seven-card-plan", refresh);
  return <DataState state={state}>{(data) => data.member ? <ClubAccountCard status={data.member} available={available} onNavigate={onNavigate} /> : null}</DataState>;
}
