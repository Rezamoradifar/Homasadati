# API پلتفرم همای سعادت

پیشوند مسیرها `/api/platform` است. درخواست‌های تغییردهنده از نوع JSON و با `Origin` مطابق `APP_ORIGIN` هستند. کوکی نشست `homay_account`، HttpOnly است؛ توکن خام در دیتابیس نگهداری نمی‌شود. پاسخ‌ها cache نمی‌شوند. واحد مبلغ حسابداری **تومان** و واحد امتیاز مستقل است. کلید تکرار عملیات مالی UUID است: ارسال دوباره همان داده اثری دوباره ندارد؛ تغییر داده با همان کلید 409 می‌دهد.

## مسیرهای اصلی موجود

| بخش        | مسیرها                                                                                                                                            | کاربرد                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| احراز هویت | `auth/config`, `auth/otp`, `auth/verify-email`, `auth/verify-contact`, `auth/register`, `auth/login`, `auth/logout`, `auth/reset`, `auth/refresh` | عضویت، OTP، نشست، بازیابی، چرخش نشست                |
| گوگل       | `auth/google-challenge`, `auth/google`, `auth/google-login`                                                                                       | چالش و تأیید هویت گوگل با کنترل اتصال حساب          |
| حساب       | `me`, `profile`, `member-details`, `contact`, `security`                                                                                          | اطلاعات حساب، تنظیمات، 2FA و نشست‌ها                |
| فروشگاه    | `catalog`, `cart/quote`, `checkouts`, `orders`, `addresses`, `subscriptions`                                                                      | کاتالوگ، سبد، سفارش و خدمات                         |
| پرداخت     | `orders/{id}/payment`, `checkouts/{id}/payment`, `payment/callback`                                                                               | ایجاد پرداخت و تأیید سمت سرور                       |
| پیگیری     | `orders/{id}`, `orders/{id}/invoice`, `orders/{id}/cancel`                                                                                        | مشاهده، فاکتور و لغو با رضایت بازگشت به کیف پول     |
| باشگاه     | `club`, `loyalty`, `loyalty/redeem`, `loyalty/cancel`, `missions`, `travel-cards`                                                                 | شرایط عمومی، امتیازات، مزایا، مأموریت‌ها و کارت سفر |
| شبکه       | `referrals/check`, `network`, `binary`, `commissions`, `income-plan`                                                                              | دعوت، معرف، جایگاه و گزارش مالی                     |
| مالی       | `wallet`, `withdrawals`                                                                                                                           | گردش پول و درخواست برداشت                           |
| محتوا      | `content`, `merchants`, `notifications`                                                                                                           | محتوا و پذیرندگان عمومی؛ اعلان‌های شخصی             |
| پذیرنده    | `merchant`, `merchant/orders`                                                                                                                     | محصولات، سفارش‌های همان پذیرنده و پیگیری تحویل      |

روش HTTP و بدنه باید مطابق handler یا قرارداد ماژول باشد؛ همه مسیرهای فوق الزاماً هر دو GET و POST را نمی‌پذیرند. سفارش‌ها و سبدها پرداخت دوباره را با کلید تکرار کنترل می‌کنند. تأیید پرداخت از مرورگر پذیرفته نمی‌شود؛ callback با درگاه بررسی می‌شود.

## قرارداد ماژول‌های جدید

`docs/openapi.json`، OpenAPI 3.0.3 برای باینری، باشگاه، پذیرندگان و مدیریت دسترسی است. ساختار ورودی‌ها از همان Zod مورد استفاده سرور تولید می‌شود:

```bash
npm run api:spec
```

این قرارداد تمام APIهای قدیمی پروژه را به‌صورت تفصیلی پوشش نمی‌دهد؛ فهرست بالا راهنمای پیدا کردن handlerهای آن‌هاست. شرط‌های مالی، تاریخ معتبر، مالکیت داده و پالایش‌های پیچیده علاوه بر ساختار OpenAPI در سرور بررسی می‌شوند.

## مجوزها

- نقش اصلی و نقش‌های اختصاصی فعال به‌صورت افزایشی ترکیب می‌شوند.
- مجوز هر منبع از `resource:read` و `resource:write` تشکیل می‌شود؛ نام منبع در `src/platform/access-model.ts` تعریف شده است.
- مجوز نوشتن، به‌طور خودکار مجوز نمایش منو نمی‌دهد؛ برای اپراتور پنل، مجوز خواندن همان منبع را هم بدهید.
- مدیریت نقش‌ها و تنظیم کلید سرویس‌ها فقط در اختیار `superadmin` داخلی است؛ نقش اختصاصی نمی‌تواند `*` یا مجوز تنظیم کلید ایجاد کند.
- مدیریت وضعیت سفارش به‌تنهایی مجوز مرجوعی وجه ندارد؛ `refunds:write` جداگانه بررسی می‌شود.
- دسترسی پذیرنده بر پایه مالکیت قرارداد در هر درخواست کنترل می‌شود؛ شناسه ارسال‌شده از مرورگر مجوز ایجاد نمی‌کند.
- لغو نقش روی API فوری است؛ پنل اطلاعات حساب را هر ۱۵ ثانیه تازه می‌کند.

## نمونه باینری

```json
{
  "rules": {
    "leftRatio": 1,
    "rightRatio": 1,
    "dailyCap": 0,
    "carryDays": 0,
    "personalMinimum": 0,
    "activityDays": 30,
    "directMinimum": 0
  },
  "reason": "تأیید پلن سفارش‌های جدید"
}
```

این نمونه رفتار باینری قبلی را حفظ می‌کند و پیشنهاد نرخ یا وعده درآمد نیست. ثبت در `POST admin/binary-rules` انجام می‌شود. نرخ پرداخت همچنان از `admin/policy` می‌آید. تغییر قواعد، سفارش‌های قبلی را بازنویسی نمی‌کند. تطبیق در زمان پرداخت سفارش و در بودجه همان سفارش رخ می‌دهد؛ تعادل بدون فروش جدید، تسویه زمان‌بندی‌شده مستقلی ایجاد نمی‌کند.

## وضعیت‌ها و صفحه‌بندی

- اسناد امتیاز: adjustment، purchase، redemption، reversal، expiry و purchase_refund.
- درخواست مزیت: requested ← fulfilled یا cancelled؛ حالت نهایی دوباره تغییر نمی‌کند.
- امتیاز سفارش: pending ← earned؛ مرجوعی آن را cancelled یا reversed می‌کند.
- فروش پذیرنده: pending ← available پس از تحویل و مهلت لغو؛ مرجوعی به reversed می‌برد.
- ثبت تسویه پذیرنده فقط ثبت پرداخت بیرون از سامانه است؛ اتصال ارسال خودکار وجه بانکی وجود ندارد.
- فهرست‌های صفحه‌بندی‌شده ۳۰ رکورد دارند؛ page از ۱ شروع می‌شود. فهرست‌های نمای خلاصه مانند مزایا حداکثر ۱۰۰ رکورد دارند. محدودیت‌های جزئی در خروجی handler مشخص‌اند.

## CI

Workflow با دسترسی خواندن مخزن، تست‌ها، تولید قرارداد API و build را اجرا می‌کند. تنظیم Actionها با مستندات رسمی [checkout](https://github.com/actions/checkout) و [setup-node](https://github.com/actions/setup-node) تطبیق داده شده است. اجرای workflow روی GitHub هنوز انجام نشده است.

## عملیات (migration 11)

- `GET/POST /api/platform/tickets`: فهرست/ثبت درخواست عضو؛ `GET/PATCH /tickets/:id` جزئیات/بستن؛ `POST /tickets/:id/replies` پاسخ.
- `GET /api/platform/admin/tickets` و `GET/PATCH /admin/tickets/:id` و `POST /admin/tickets/:id/replies`: مجوز خواندن/نوشتن تیکت؛ internal فقط کارکنان.
- `GET/POST /api/platform/admin/binary-schedule`: snapshot زمان‌بندی برای سفارش جدید؛ اجرای مالی توسط worker.
- `POST /api/platform/admin/merchant-settlements/review`: تأیید/رد مستقل با `id`, `action`, `reason`. ثبت اولیه تسویه اکنون پیشنهاد رزروشده می‌سازد.
- `GET /api/health/ready`: Bearer MONITOR_TOKEN؛ 401/200/503؛ جزئیات بدون داده شخصی.
- برداشت paid به دو مدیر مستقل نیاز دارد؛ خطاهای `self_payment_review`, `first_approval_required`, `second_approver_required`.

قراردادهای جدید از Zod در OpenAPI تولید می‌شوند. رفتار و مهاجرت درخواست قدیمی در [OPERATIONS.md](OPERATIONS.md) است.
