"use client";

import { ArrowUpLeft, Bell, Crown, Gift, Package, ShieldCheck, ShoppingBag, Users, Wallet } from "lucide-react";
import { useSiteSettings } from "./SiteSettings";
import { amount, rialAmount, type RecordData } from "./client";

type Props = {
  user: RecordData;
  data: RecordData;
  onNavigate: (tab: string) => void;
};

/** Display-only dashboard: figures come from the existing authenticated dashboard API. */
export default function PremiumMemberDashboard({ user, data, onNavigate }: Props) {
  const { site_logo } = useSiteSettings();
  const wallet = data.wallet || {};
  const rank = data.rank || {};
  const activity = data.activity || {};
  const club = data.club || {};
  const referralCode = String(user.referral_code || data.invitation?.code || "").trim();
  const activeRank = rank.current?.name || "هنوز رتبه‌ای کسب نشده";
  const progress = Number(rank.progress);
  const hasProgress = !!rank.next && Number.isFinite(progress);
  const progressPercent = hasProgress ? Math.min(100, Math.max(0, Math.round(progress * 100))) : 0;

  const money = (value: unknown) =>
    value == null || !Number.isFinite(Number(value))
      ? "—"
      : rialAmount(Number(value));
  const count = (value: unknown) =>
    value == null || !Number.isFinite(Number(value)) ? "—" : amount(value);

  return (
    <section className="member-luxe-overview" aria-label="حساب شما در یک نگاه">
      <div className="member-luxe-hero">
        <div className="member-luxe-halo" aria-hidden="true" />
        <div className="member-luxe-copy">
          <div className="member-luxe-kicker"><span className="member-luxe-sparkle" aria-hidden="true">✦</span> HOMA MEMBER</div>
          <h2>خوش آمدید، <bdi translate="no">{user.name}</bdi></h2>
          <p>حساب شما در یک نگاه</p>
          <div className="member-luxe-identity">
            <span><Crown size={18} aria-hidden="true" /> <span>رتبه</span> <bdi translate="no">{activeRank}</bdi></span>
            {referralCode && <span className="member-luxe-referral"><span>REFERRAL ID</span><bdi dir="ltr" translate="no">{referralCode}</bdi></span>}
          </div>
          <div className="member-luxe-links" role="group" aria-label="دسترسی سریع">
            <button type="button" className="member-luxe-primary" onClick={() => onNavigate("wallet")}>
              <Wallet size={18} aria-hidden="true" />کیف پول و برداشت
            </button>
            <button type="button" className="member-luxe-secondary" onClick={() => onNavigate("orders")}>
              <Package size={18} aria-hidden="true" />سفارش‌های من
            </button>
          </div>
          {hasProgress && (
            <div className="member-luxe-rank-progress">
              <div><span>پیشرفت رتبه</span><strong>{amount(progressPercent)}٪</strong></div>
              <div role="progressbar" aria-label="پیشرفت رتبه" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: progressPercent + "%" }} />
              </div>
            </div>
          )}
        </div>
        <div className="member-luxe-device">
          <div className="member-luxe-device-top">
            <div className="member-luxe-brand">
              <img src={site_logo || "/assets/brand-mark.png"} alt="" width={42} height={42} />
              <span>HOMA <small>MEMBER</small></span>
            </div>
            <button type="button" onClick={() => onNavigate("notifications")} aria-label="اعلان‌ها" title="اعلان‌ها">
              <Bell size={19} aria-hidden="true" />
              {Number(activity.unreadNotifications) > 0 && <span className="member-luxe-notification-dot" />}
            </button>
          </div>
          <div className="member-luxe-goldcard">
            <div className="member-luxe-goldcard-top"><Wallet size={21} aria-hidden="true"/><span>موجودی قابل برداشت</span></div>
            <strong className="member-luxe-amount" dir="ltr">{money(wallet.available)}</strong>
            <small>ریال</small>
            <div className="member-luxe-goldcard-mark" aria-hidden="true">✦</div>
          </div>
          <div className="member-luxe-device-stats">
            <button type="button" onClick={() => onNavigate("commissions")}>
              <Gift size={18} aria-hidden="true" />
              <span>در انتظار تسویه</span>
              <strong>{money(wallet.pending)} <small>ریال</small></strong>
            </button>
            <button type="button" onClick={() => onNavigate("orders")}>
              <Package size={18} aria-hidden="true" />
              <span>سفارش در جریان</span>
              <strong>{count(activity.activeOrders)}</strong>
            </button>
            <button type="button" onClick={() => onNavigate("seven-card-plan")}>
              <Crown size={18} aria-hidden="true" />
              <span>جایگاه فعال</span>
              <strong>{count(club.desks)}</strong>
            </button>
          </div>
          <button type="button" className="member-luxe-device-cta" onClick={() => onNavigate("profile")}>
            مشاهده پروفایل <ArrowUpLeft size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="member-luxe-access" aria-label="دسترسی سریع">
        <button type="button" onClick={() => onNavigate("catalog")}><ShoppingBag size={23} aria-hidden="true"/><span>خرید و رزرو</span></button>
        <button type="button" onClick={() => onNavigate("network")}><Users size={23} aria-hidden="true"/><span>شبکه و دعوت</span></button>
        <button type="button" onClick={() => onNavigate("loyalty")}><Gift size={23} aria-hidden="true"/><span>امتیازات و مزایا</span></button>
        <button type="button" onClick={() => onNavigate("security")}><ShieldCheck size={23} aria-hidden="true"/><span>امنیت حساب</span></button>
      </div>
    </section>
  );
}
