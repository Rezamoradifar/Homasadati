import { hasPermission } from "./access-model";
export const adminTabs: [string, string, string[]][] = [
  ["seven-card-plan", "پلن هشت کارت", ["superadmin", "finance"]],
  ["tickets", "پشتیبانی و تیکت‌ها", ["superadmin", "support"]],
  ["binary-schedule", "زمان‌بندی تسویه باینری", ["superadmin", "finance"]],
  ["binary-rules", "قواعد و شبیه‌ساز باینری", ["superadmin", "finance"]],
  ["loyalty-policy", "قواعد و سطوح امتیاز", ["superadmin", "finance"]],
  [
    "merchant-operations",
    "قراردادها و محصولات پذیرنده",
    ["superadmin", "finance"],
  ],
  ["merchant-settlements", "تسویه پذیرندگان", ["superadmin", "finance"]],
  ["access", "نقش‌ها و مجوزها", ["superadmin"]],
  ["notifications", "ارسال اعلان", ["superadmin", "support"]],
  ["newsletter", "خبرنامهٔ ایمیلی", ["superadmin", "content"]],
  ["binary", "مرکز باینری", ["superadmin", "finance"]],
  ["merchants", "پذیرندگان", ["superadmin", "content"]],
  ["loyalty", "مدیریت امتیازات", ["superadmin", "finance"]],
  ["rewards", "مزایای باشگاه", ["superadmin", "finance"]],
  ["redemptions", "درخواست‌های مزایا", ["superadmin", "finance", "support"]],
  ["home", "میز کار مدیر", ["superadmin", "content", "finance", "support"]],
  ["travel", "کارت سفر و کارگزار", ["superadmin", "finance", "support"]],
  ["operations", "داشبورد کسب‌وکار", ["superadmin", "finance"]],
  ["operations-tourism", "داشبورد گردشگری", ["superadmin", "finance"]],
  ["operations-beauty", "داشبورد زیبایی", ["superadmin", "finance"]],
  ["operations-craft", "داشبورد صنایع‌دستی", ["superadmin", "finance"]],
  ["operations-ai", "داشبورد هوش مصنوعی", ["superadmin", "finance"]],
  ["operations-leather", "داشبورد چرم ایران", ["superadmin", "finance"]],
  ["dashboard", "سلامت مالی", ["superadmin", "finance"]],
  ["products", "محصولات و تورها", ["superadmin", "content"]],
  ["taxonomy", "دسته‌ها و برچسب‌ها", ["superadmin", "content"]],
  ["orders", "سفارش‌ها", ["superadmin", "finance", "support"]],
  ["withdrawals", "درخواست‌های برداشت", ["superadmin", "finance"]],
  ["users", "اعضای مجموعه", ["superadmin", "support"]],
  ["network", "مدیریت شبکه", ["superadmin"]],
  ["commissions", "دفتر پورسانت", ["superadmin", "finance"]],
  ["policy", "نرخ‌ها و کنترل پرداخت", ["superadmin", "finance"]],
  ["ranks", "رتبه‌ها", ["superadmin", "finance"]],
  ["missions", "مأموریت‌ها", ["superadmin", "content"]],
  ["reports", "گزارش‌ها", ["superadmin", "finance"]],
  ["content", "مدیریت محتوا", ["superadmin", "content"]],
  ["flags", "بررسی حساب‌ها", ["superadmin", "support"]],
  ["audit", "تاریخچهٔ تغییرات", ["superadmin"]],
  ["settings", "تنظیمات سیستم", ["superadmin"]],
  ["security", "امنیت حساب", ["superadmin", "content", "finance", "support"]],
];

export const adminGroups = [
  {
    title: "شبکه و باشگاه مشتریان",
    keys: [
      "seven-card-plan",
      "binary",
      "binary-rules",
      "binary-schedule",
      "network",
      "loyalty-policy",
      "loyalty",
      "rewards",
      "redemptions",
    ],
  },
  {
    title: "مرکز مدیریت",
    keys: ["home", "operations", "dashboard", "reports"],
  },
  {
    title: "فروش و خدمات",
    keys: [
      "products",
      "taxonomy",
      "orders",
      "travel",
      "merchants",
      "merchant-operations",
      "merchant-settlements",
    ],
  },
  {
    title: "اعضا و باشگاه",
    keys: ["tickets", "users", "ranks", "missions", "flags"],
  },
  { title: "امور مالی", keys: ["withdrawals", "commissions", "policy"] },
  {
    title: "حوزه‌های کسب‌وکار",
    keys: [
      "operations-tourism",
      "operations-beauty",
      "operations-craft",
      "operations-ai",
      "operations-leather",
    ],
  },
  {
    title: "محتوا و تنظیمات",
    keys: [
      "content",
      "notifications",
      "newsletter",
      "access",
      "settings",
      "audit",
      "security",
    ],
  },
];
export function visibleAdminTabs(role: string, permissions?: string[]) {
  if (!permissions)
    return adminTabs.filter(([, , roles]) => roles.includes(role));
  return adminTabs.filter(([key]) =>
    key === "access"
      ? role === "superadmin"
      : ["home", "security"].includes(key)
        ? permissions.length > 0
        : hasPermission(
            permissions,
            key.startsWith("operations") ? "operations" : key,
          ),
  );
}
export function searchAdminGroups(
  role: string,
  query = "",
  permissions?: string[],
) {
  const normalize = (value: string) =>
    value
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/\u200c/g, " ")
      .trim()
      .toLowerCase();
  const search = normalize(query);
  const tabs = visibleAdminTabs(role, permissions);
  return adminGroups
    .map((group) => ({
      title: group.title,
      tabs: tabs.filter(
        ([key, label]) =>
          group.keys.includes(key) &&
          (!search ||
            normalize(label).includes(search) ||
            key.includes(search) ||
            normalize(group.title).includes(search)),
      ),
    }))
    .filter((group) => group.tabs.length > 0);
}
