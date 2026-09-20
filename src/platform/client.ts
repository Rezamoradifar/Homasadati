import { validateClient } from "./client-validation";
export type RecordData = Record<string, any>;
export const errors: Record<string, string> = {
  travel_notice:"درخواست باید حداقل هفت روز کاری کامل پیش از سفر و در محدوده اعتبار کارت باشد.",
  travel_ineligible:"شرایط خرید، رتبه یا اعتبار کارت برای این عملیات برقرار نیست.",
  too_large: "حجم اطلاعات ارسالی بیش از حد مجاز است.",
  product_unavailable: "یکی از محصولات سبد دیگر قابل فروش نیست؛ آن را حذف کنید.",
  price_changed: "قیمت تغییر کرده است؛ سبد را تازه‌سازی و مبلغ جدید را تأیید کنید.",
  address_required: "برای کالاهای فیزیکی یک آدرس معتبر از حساب خود انتخاب کنید.",
  invalid_image: "تصویر معتبر نیست؛ فایل JPEG، PNG یا WebP سالم انتخاب کنید.",
  unauthorized: "برای ادامه وارد حساب شوید.",
  forbidden: "نقش شما اجازهٔ این عملیات را ندارد.",
  product_changed:
    "موجودی یا مشخصات این محصول تغییر کرده است. فرم را ببندید، فهرست را تازه‌سازی کنید و دوباره ویرایش کنید.",
  invalid_input: "اطلاعات واردشده معتبر نیست. فیلدها را بررسی کنید.",
  invalid_credentials: "اطلاعات ورود درست نیست.",
  invalid_otp: "کد تأیید نادرست، مصرف‌شده یا منقضی است.",
  account_exists: "این ایمیل یا شماره قبلاً ثبت شده است.",
  invalid_referral: "کد معرف معتبر نیست.",
  duplicate_record: "این اطلاعات قبلاً ثبت شده است.",
  invalid_reference: "رکورد مرتبط وجود ندارد.",
  insufficient_balance: "موجودی قابل استفاده کافی نیست یا حساب بدهی دارد.",
  out_of_stock: "موجودی این محصول کافی نیست.",
  payouts_paused:
    "پرداخت‌های جدید موقتاً متوقف شده‌اند؛ با پشتیبانی تماس بگیرید.",
  withdrawal_limits: "مبلغ برداشت خارج از حداقل یا سقف تعیین‌شده است.",
  cancellation_expired: "مهلت لغو این سفارش تمام شده است.",
  invalid_state: "وضعیت فعلی اجازهٔ این تغییر را نمی‌دهد.",
  network_cycle: "این جابه‌جایی باعث حلقه در شبکه می‌شود.",
  rate_limited: "درخواست‌ها بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید.",
  policy_not_configured: "تنظیمات مالی هنوز توسط مدیر تکمیل نشده است.",
  email_not_configured: "سرویس ایمیل هنوز تنظیم نشده است.",
  sms_not_configured: "سرویس پیامک هنوز تنظیم نشده است.",
  payment_not_configured: "درگاه پرداخت هنوز آماده نیست.",
  encryption_not_configured: "کلید رمزنگاری سرور تنظیم نشده است.",
  provider_unavailable:
    "ارتباط با سرویس ارائه‌دهنده برقرار نشد. دوباره تلاش کنید.",
  provider_rejected: "سرویس ارائه‌دهنده درخواست را نپذیرفت.",
  payment_unverified: "پرداخت تأیید نشده است.",
  payment_request_in_progress:
    "درخواست درگاه در حال پردازش است. کمی بعد دوباره بررسی کنید.",
  payment_reconciliation_required:
    "ابتدا وضعیت پرداخت درگاه باید بررسی شود؛ با پشتیبانی تماس بگیرید.",
  idempotency_conflict:
    "شناسهٔ درخواست با اطلاعات قبلی متفاوت است. صفحه را تازه کنید.",
  product_has_orders:
    "این محصول سابقهٔ سفارش دارد؛ به‌جای حذف، انتشار آن را غیرفعال کنید.",
  cannot_modify_self: "نمی‌توانید نقش یا وضعیت حساب فعلی خودتان را تغییر دهید.",
  not_found: "مورد درخواستی پیدا نشد.",
  server_error: "خطایی در سرور رخ داد. درخواست را دوباره بررسی کنید.",
  origin_denied: "نشانی سایت با تنظیمات سرور هماهنگ نیست.",
  origin_required: "درخواست معتبر نیست.",
};
export async function api(path: string, method = "GET", data?: unknown) {
  if (method !== "GET") {
    try {
      data = validateClient(path, method, data || {});
    } catch {
      throw new Error(
        "اطلاعات فرم معتبر نیست؛ قالب، حداقل و حداکثر مقادیر را بررسی کنید.",
      );
    }
  }
  let response: Response;
  try {
    response = await fetch("/api/platform/" + path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      ...(method === "GET" ? {} : { body: JSON.stringify(data || {}) }),
    });
  } catch {
    throw new Error("ارتباط شبکه قطع است. اتصال اینترنت را بررسی کنید.");
  }
  let result: RecordData;
  try {
    result = await response.json();
  } catch {
    throw new Error("پاسخ قابل خواندن از سرور دریافت نشد.");
  }
  if (!response.ok)
    throw new Error(
      errors[result.error] || "عملیات انجام نشد؛ دوباره تلاش کنید.",
    );
  return result;
}
export const amount = (n: unknown) => Number(n ?? 0).toLocaleString("fa-IR");
export const date = (v: unknown) =>
  v
    ? new Date(String(v)).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })
    : "—";
export const labels: Record<string, string> = {
  tourism: "گردشگری",
  beauty: "زیبایی",
  craft: "صنایع‌دستی",
  leather: "چرم ایران",
  ai: "اشتراک هوش مصنوعی",
  pending: "در انتظار",
  processing: "در حال پردازش",
  shipped: "ارسال‌شده",
  delivered: "تحویل‌شده",
  cancelled: "لغوشده",
  refunded: "بازگشت وجه",
  approved: "تأییدشده",
  rejected: "ردشده",
  paid: "پرداخت‌شده",
  available: "قابل برداشت",
  reversed: "برگشت پورسانت",
  direct: "مستقیم",
  level: "سطحی",
  binary: "باینری",
  rank: "رتبه",
  user: "کاربر",
  superadmin: "سوپرادمین",
  content: "مدیر محتوا",
  support: "پشتیبانی",
  finance: "مدیر مالی",
  wallet: "کیف پول",
  zarinpal: "زرین‌پال",
  personal_sales: "فروش شخصی",
  group_sales: "فروش گروهی",
  referrals: "دعوت موفق",
  orders: "سفارش",
  left: "چپ",
  right: "راست",
};
