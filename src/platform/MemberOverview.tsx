"use client";

import {
  ArrowUpLeft,
  Bell,
  BookOpen,
  CreditCard,
  Gift,
  GitBranch,
  LifeBuoy,
  Package,
  Plane,
  ShieldCheck,
  ShoppingBag,
  Users,
  Wallet,
} from "lucide-react";
import { MouseEvent } from "react";
import { amount, RecordData } from "./client";
import Localized from "../i18n/Localized";

const shortcuts = [
  {
    tab: "catalog",
    title: "خرید و رزرو",
    text: "محصولات و خدمات منتشرشدهٔ مجموعه",
    icon: ShoppingBag,
  },
  {
    tab: "wallet",
    title: "کیف پول و برداشت",
    text: "موجودی، تراکنش‌ها و پیگیری برداشت",
    icon: Wallet,
  },
  {
    tab: "network",
    title: "شبکه و دعوت",
    text: "کد معرفی و اعضای شبکهٔ شما",
    icon: Users,
  },
  {
    tab: "binary",
    title: "شبکه باینری",
    text: "جایگاه، حجم شاخه‌ها و سوابق تعادل",
    icon: GitBranch,
  },
  {
    tab: "loyalty",
    title: "امتیازات و مزایا",
    text: "امتیازهای کسب‌شده و مزایای باشگاه",
    icon: Gift,
  },
  {
    tab: "travel-cards",
    title: "کارت سفر من",
    text: "اعتبار کارت و درخواست هماهنگی سفر",
    icon: Plane,
  },
  {
    tab: "commissions",
    title: "پورسانت‌ها",
    text: "جزئیات مبالغ و وضعیت آزادسازی",
    icon: CreditCard,
  },
  {
    tab: "security",
    title: "امنیت حساب",
    text: "رمز عبور، تأیید دومرحله‌ای و نشست‌ها",
    icon: ShieldCheck,
  },
];

export function MemberOverview({
  user,
  activity = {},
  onNavigate,
}: {
  user: RecordData;
  activity: RecordData;
  onNavigate: (tab: string) => void;
}) {
  const follow = (event: MouseEvent<HTMLAnchorElement>, tab: string) => {
    if (
      event.button === 0 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      onNavigate(tab);
    }
  };
  const counters = [
    {
      tab: "orders",
      label: "سفارش در جریان",
      value: activity.activeOrders,
      icon: Package,
    },
    {
      tab: "notifications",
      label: "اعلان خوانده‌نشده",
      value: activity.unreadNotifications,
      icon: Bell,
    },
    {
      tab: "tickets",
      label: "درخواست پشتیبانی باز",
      value: activity.openTickets,
      icon: LifeBuoy,
    },
    {
      tab: "subscriptions",
      label: "اشتراک فعال",
      value: activity.activeSubscriptions,
      icon: BookOpen,
    },
  ];
  return (
    <Localized>
      <section className="member-welcome">
        <div>
          <span>هما نت · باشگاه همراهان</span>
          <h2>
            خوش آمدید، <bdi translate="no">{user.name}</bdi>
          </h2>
          <p>خریدها، خدمات، مزایا و وضعیت حساب شما در یک نگاه.</p>
        </div>
        <a href="/account?tab=profile" onClick={(e) => follow(e, "profile")}>
          مشاهده پروفایل <ArrowUpLeft size={18} aria-hidden="true" />
        </a>
      </section>
      <section className="member-activity" aria-label="وضعیت خدمات من">
        {counters.map(({ tab, label, value, icon: Icon }) => (
          <a
            key={tab}
            href={`/account?tab=${tab}`}
            onClick={(e) => follow(e, tab)}
          >
            <Icon size={21} aria-hidden="true" />
            <strong>{value == null ? "—" : amount(value)}</strong>
            <span>{label}</span>
          </a>
        ))}
      </section>
      <section
        className="member-services"
        aria-labelledby="member-services-heading"
      >
        <h2 id="member-services-heading">دسترسی سریع به خدمات</h2>
        <div className="member-shortcuts">
          {shortcuts.map(({ tab, title, text, icon: Icon }) => (
            <a
              key={tab}
              href={`/account?tab=${tab}`}
              onClick={(e) => follow(e, tab)}
            >
              <Icon size={23} aria-hidden="true" />
              <strong>{title}</strong>
              <p>{text}</p>
            </a>
          ))}
        </div>
      </section>
    </Localized>
  );
}
