import { validateClient } from "./client-validation";
import { formatDate } from "../i18n/core";
export type RecordData = Record<string, any>;
export const errors: Record<string, string> = {
  self_payment_review: "نمی‌توانید پرداخت مربوط به حساب خودتان را بررسی کنید.",
  direct_capacity_reached: "ظرفیت معرفی مستقیم شما تکمیل است. با خرید و فعال‌شدن جایگاه بعدی، ظرفیت افزایش می‌یابد.",
  direct_position_required: "معرف باید ابتدا جایگاه این ورودی را در پنل دعوت انتخاب کند.",
  direct_position_occupied: "این جایگاه قبلاً پر شده است؛ یک جایگاه خالی را انتخاب کنید.",
  direct_position_locked: "جانمایی این عضو ثبت شده است؛ تغییر آن به بررسی سابقهٔ شبکه نیاز دارد.",
  second_approver_required: "این پرداخت باید توسط مدیر مجاز دیگری تأیید شود.",
  first_approval_required: "ابتدا یک مدیر مجاز باید تأیید نخست را ثبت کند.",
  ticket_limit:
    "ابتدا درخواست‌های باز قبلی را پیگیری یا ببندید؛ حداکثر ۲۰ درخواست باز مجاز است.",
  record_changed:
    "اطلاعات تغییر کرده است؛ فهرست را تازه‌سازی کنید و دوباره اقدام کنید.",
  merchant_unavailable: "پذیرنده یا قرارداد این محصول فعال نیست.",
  merchant_terms_invalid:
    "سهم پذیرنده و سقف پورسانت شبکه نیاز به اصلاح مدیر مالی دارند.",
  insufficient_points: "امتیاز کافی برای این عملیات ندارید.",
  method_not_allowed: "این عملیات در این مسیر مجاز نیست.",
  google_not_configured: "ورود گوگل هنوز تنظیم نشده است.",
  google_verification_failed:
    "تأیید گوگل نامعتبر یا منقضی است؛ دوباره تلاش کنید.",
  google_already_linked: "این حساب قبلاً به گوگل متصل شده است.",
  google_link_required:
    "ابتدا وارد حساب قبلی شوید و گوگل را از بخش امنیت متصل کنید؛ برای حساب جدید ثبت‌نام را انتخاب کنید.",
  google_email_check_required:
    "برای این نشانی، ثبت‌نام با کد تأیید ایمیل را انجام دهید.",
  captcha_not_configured:
    "ورود امن هنوز آماده نیست؛ لطفاً با پشتیبانی تماس بگیرید.",
  captcha_required: "ابتدا بررسی امنیتی کپچا را کامل کنید.",
  captcha_invalid: "بررسی امنیتی منقضی یا نامعتبر است؛ دوباره انجام دهید.",
  captcha_unavailable:
    "سرویس بررسی امنیتی در دسترس نیست؛ کمی بعد دوباره تلاش کنید.",
  enrollment_expired:
    "مهلت یا تعداد تلاش‌های تأیید پایان یافت؛ تأیید ایمیل را دوباره انجام دهید.",
  rank_name_conflict:
    "رتبه هم‌نام وجود دارد. ابتدا نام رتبه قبلی را تغییر دهید؛ هیچ تغییری اعمال نشد.",
  travel_notice:
    "درخواست باید حداقل هفت روز کاری کامل پیش از سفر و در محدوده اعتبار کارت باشد.",
  travel_ineligible:
    "شرایط خرید، رتبه یا اعتبار کارت برای این عملیات برقرار نیست.",
  too_large: "حجم اطلاعات ارسالی بیش از حد مجاز است.",
  product_unavailable:
    "یکی از محصولات سبد دیگر قابل فروش نیست؛ آن را حذف کنید.",
  price_changed:
    "قیمت تغییر کرده است؛ سبد را تازه‌سازی و مبلغ جدید را تأیید کنید.",
  address_required:
    "برای کالاهای فیزیکی یک آدرس معتبر از حساب خود انتخاب کنید.",
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
  referral_code_taken: "این کد معرف قبلاً انتخاب شده است؛ کد دیگری امتحان کنید.",
  referral_change_too_soon: "کد معرف را هر ۷ روز یک بار می‌توانید تغییر دهید.",
  national_id_mismatch: "کد ملی حساب بانکی باید با کد ملی ثبت‌شده در عضویت یکی باشد.",
  phone_in_use: "این شماره موبایل برای حساب دیگری ثبت شده است.",
  national_id_in_use: "این کد ملی برای حساب دیگری ثبت شده است.",
  approved_plan_rules_required: "قواعد تأییدشدهٔ پلن باید حفظ شوند؛ محاسبه دوشنبه، پرداخت هفتهٔ بعد و سوختن مازاد سقف.",
  weekly_calculation_in_progress: "خرید موقتاً برای محاسبهٔ هفتگی متوقف است؛ پس از پایان محاسبه دوباره تلاش کنید.",
  bank_ownership_proof_required: "تطابق کد ملی، نام و مالکیت حساب باید با مرجع بررسی تأیید شود.",
  inheritance_proof_required: "برای حساب وارث، مدرک وراثت و تأیید مدیر لازم است.",
  payout_profile_required: "برداشت پس از ثبت و تأیید اطلاعات بانکی ممکن است.",
  two_factor_required:
    "برای برداشت، ابتدا تأیید دومرحله‌ای را در بخش امنیت حساب فعال کنید.",
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
  payment_verification_pending:
    "پرداخت قبلی شما هنوز در حال بررسی است؛ چند دقیقه بعد دوباره تلاش کنید.",
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
export class PlatformApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(errors[code] || "عملیات انجام نشد؛ دوباره تلاش کنید.");
    this.name = "PlatformApiError";
  }
}
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
  const started = Date.now();
  const diagnostic = (kind: string) => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("platform-diagnostic", {detail:{kind,duration:Date.now()-started}}));
  };
  // Only reads have a time limit: never retry or obscure a possibly completed payment mutation.
  const controller = method === "GET" ? new AbortController() : undefined;
  const timer = controller ? setTimeout(()=>controller.abort(),20000) : undefined;
  try {
    let response: Response;
    try {
      response = await fetch("/api/platform/" + path, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        ...(controller ? {signal:controller.signal} : {}),
        ...(method === "GET" ? {} : { body: JSON.stringify(data || {}) }),
      });
    } catch {
      diagnostic(controller?.signal.aborted ? "api_timeout" : "api_network");
      throw new Error(controller?.signal.aborted ? "دریافت اطلاعات بیش از حد طول کشید؛ دوباره تلاش کنید." : "ارتباط شبکه قطع است. اتصال اینترنت را بررسی کنید.");
    }
    let result: RecordData;
    try {
      result = await response.json();
    } catch {
      diagnostic(controller?.signal.aborted ? "api_timeout" : "api_invalid");
      throw new Error(controller?.signal.aborted ? "دریافت اطلاعات بیش از حد طول کشید؛ دوباره تلاش کنید." : "پاسخ قابل خواندن از سرور دریافت نشد.");
    }
    if (!response.ok) {
      if (response.status >= 500) diagnostic("api_server");
      if (result.error === "unauthorized" && typeof window !== "undefined")
        window.dispatchEvent(new Event("platform-session-expired"));
      throw new PlatformApiError(String(result.error || "server_error"),response.status);
    }
    if (Date.now()-started>4000) diagnostic("api_slow");
    return result;
  } finally {
    if(timer)clearTimeout(timer);
  }
}

export const amount = (n: unknown) => Number(n ?? 0).toLocaleString("fa-IR");
export const date = formatDate;
export const labels: Record<string, string> = {
  failed: "ناموفق",
  request_failed: "خطا در اتصال به درگاه",
  order: "سفارش",
  checkout: "سبد خرید",
  waiting_support: "در انتظار پشتیبانی",
  waiting_user: "در انتظار کاربر",
  closed: "بسته‌شده",
  normal: "عادی",
  high: "زیاد",
  urgent: "فوری",
  confirmed: "تأیید نهایی",
  account: "حساب کاربری",
  other: "سایر",
  fulfilled: "تحویل‌شده",
  requested: "در انتظار بررسی",
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
  company_credit: "اعتبار خرید شرکت",
  wallet: "کیف پول",
  zarinpal: "زرین‌پال",
  zibal: "زیبال",
  personal_sales: "فروش شخصی",
  group_sales: "فروش گروهی",
  referrals: "دعوت موفق",
  orders: "سفارش",
  left: "چپ",
  right: "راست",
};
