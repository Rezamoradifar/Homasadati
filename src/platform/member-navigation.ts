export const memberGroups = [
  {
    title: "حساب من",
    tabs: [
      ["dashboard", "نمای کلی"],
      ["notifications", "اعلان‌ها"],
      ["tickets", "پشتیبانی"],
    ],
  },
  {
    title: "خرید و خدمات",
    tabs: [
      ["catalog", "خرید و رزرو"],
      ["orders", "سفارش‌ها"],
      ["travel-cards", "کارت سفر من"],
      ["subscriptions", "اشتراک‌های من"],
    ],
  },
  {
    title: "باشگاه و شبکه",
    tabs: [
      ["seven-card-plan", "پلن هفت کارت"],
      ["network", "شبکه و دعوت"],
      ["binary", "شبکه باینری"],
      ["loyalty", "امتیازات و مزایا"],
      ["missions", "مأموریت‌ها"],
    ],
  },
  {
    title: "امور مالی",
    tabs: [
      ["wallet", "کیف پول و برداشت"],
      ["commissions", "پورسانت‌ها"],
    ],
  },
  {
    title: "تنظیمات حساب",
    tabs: [
      ["profile", "پروفایل"],
      ["addresses", "آدرس‌ها"],
      ["security", "امنیت حساب"],
    ],
  },
];

export function memberNavigation(merchant = false) {
  return merchant
    ? [
        ...memberGroups,
        { title: "همکاری با همای سعادت", tabs: [["merchant", "پنل پذیرنده"]] },
      ]
    : memberGroups;
}
