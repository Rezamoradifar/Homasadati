"use client";

import { ArrowUpLeft, Package, Users, ClipboardList, Wallet, FileText, Settings, ShieldCheck, Plane, GitBranch, Store } from "lucide-react";
import Localized from "../i18n/Localized";
import { RecordData, labels } from "./client";
import { visibleAdminTabs } from "./admin-navigation";
import { OperationsDashboard } from "./OperationsDashboard";

const shortcuts = [
  { tab: "binary", title: "مرکز باینری", text: "جایگاه‌ها، حجم شاخه‌ها و تاریخچه تعادل", icon: GitBranch },
  { tab: "merchants", title: "پذیرندگان", text: "معرفی و مدیریت پذیرندگان باشگاه", icon: Store },
  { tab: "products", title: "محصولات و تورها", text: "ثبت و ویرایش، تصاویر، قیمت و ظرفیت", icon: Package },
  { tab: "orders", title: "سفارش‌ها", text: "پیگیری خریدها و وضعیت اجرای سفارش", icon: ClipboardList },
  { tab: "users", title: "اعضای مجموعه", text: "اطلاعات اعضا و رسیدگی به حساب‌ها", icon: Users },
  { tab: "travel", title: "کارت سفر و کارگزار", text: "بررسی کارت‌ها و درخواست‌های هماهنگی سفر", icon: Plane },
  { tab: "withdrawals", title: "درخواست‌های برداشت", text: "بررسی درخواست‌ها و ثبت نتیجه پرداخت", icon: Wallet },
  { tab: "content", title: "مدیریت محتوا", text: "نوشته‌ها، بنرها و صفحات مجموعه", icon: FileText },
  { tab: "settings", title: "تنظیمات سیستم", text: "اطلاعات سایت و اتصال سرویس‌ها", icon: Settings },
  { tab: "security", title: "امنیت حساب", text: "رمز عبور، ورود دومرحله‌ای و نشست‌ها", icon: ShieldCheck },
];

export default function AdminHome({user, refresh, onNavigate}: {
  user: RecordData; refresh: number; onNavigate: (tab: string) => void;
}) {
  const allowed = new Set(visibleAdminTabs(user.role,user.permissions).map(([key]) => key));
  return <Localized><div className="admin-workspace">
    <section className="admin-welcome">
      <div>
        <span className="admin-kicker">هما نت · مدیریت مجموعه</span>
        <h2>کارهای امروز، در یک نگاه</h2>
        <p><bdi translate="no">{user.name}</bdi> · {labels[user.role]}</p>
        <p>از اینجا به کارهای روزانه و بخش‌های موردنیاز خود دسترسی دارید.</p>
      </div>
      <a href="/" className="admin-site-link">مشاهده سایت <ArrowUpLeft size={18} aria-hidden="true" /></a>
    </section>
    <section aria-labelledby="admin-shortcuts-heading">
      <div className="admin-section-heading"><h2 id="admin-shortcuts-heading">دسترسی سریع</h2><span>متناسب با نقش شما</span></div>
      <div className="admin-shortcuts">
        {shortcuts.filter(item => allowed.has(item.tab)).map(item => <a
          href={`/admin?tab=${item.tab}`} key={item.tab}
          onClick={event => {
            if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
              event.preventDefault(); onNavigate(item.tab);
            }
          }}>
          <span className="admin-shortcut-icon"><item.icon size={23} aria-hidden="true" /></span>
          <strong>{item.title}</strong><p>{item.text}</p>
        </a>)}
      </div>
    </section>
    {allowed.has("operations") && <OperationsDashboard refresh={refresh} />}
    {!allowed.has("operations") && <section className="portal-card admin-role-note">
      <ShieldCheck size={24} aria-hidden="true" />
      <div><h2>فضای کار اختصاصی شما</h2><p>فقط بخش‌های مجاز برای نقش شما نمایش داده می‌شوند. برای تغییر دسترسی با مدیر اصلی هماهنگ کنید.</p></div>
    </section>}
  </div></Localized>;
}
