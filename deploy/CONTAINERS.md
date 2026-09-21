# اجرای Development، Staging و Production

## Development

از checkout جدا و دیتابیس آزمایشی استفاده کنید:

```bash
npm ci
npm run dev
```

کلیدها در `.env.local` هستند. فایل دیتابیس واقعی و کلید رمزنگاری Production را وارد توسعه نکنید.

## Docker روی یک میزبان

Dockerfile مبتنی بر Node.js 22 است. Web و worker یک volume محلی SQLite دارند؛ این ترکیب برای scale افقی چند میزبان طراحی نشده است. ساخت و اجرای image در محیط فعلی تأیید نشده، چون Docker در این محیط موجود نیست.

یک فایل محیط محرمانه بیرون checkout ایجاد کنید؛ دسترسی آن فقط برای اپراتور باشد. مقادیر لازم:

- `APP_ORIGIN`: دقیقاً origin HTTPS محیط، بدون مسیر؛ برای Production دامنه اصلی انتخاب‌شده.
- `PLATFORM_MASTER_KEY`: کلید واقعی موجود با ۶۴ رقم hex. برای دیتابیس موجود هرگز کلید جدید جایگزین نکنید.
- `HTTP_PORT`: برای Staging برابر 3001 و برای Production برابر 3000.
- `IMAGE_TAG`: شناسه نسخه برای امکان بازگشت به image قبلی.

متغیرهای provider در تنظیمات امن پنل نگهداری می‌شوند. فایل محیط، دیتابیس، نسخه پشتیبان و کلیدها داخل image کپی نمی‌شوند.

نمونه اجرای محیط آزمایشی، پس از ایجاد فایل محیط:

```bash
docker compose --env-file /secure/homa-staging.env -p homa-staging config --quiet
docker compose --env-file /secure/homa-staging.env -p homa-staging up -d --build
```

Production از پروژه جدا با نام `homa-production` و فایل محیط و پورت جدا استفاده می‌کند. نام پروژه volumeها را از هم جدا می‌کند. اجرای این دستور با volume خالی، کاربران دیتابیس فعلی سرور را منتقل نمی‌کند.

## انتقال سرویس موجود

1. از دیتابیس و رسانه‌های فعلی با اسکریپت backup نسخه سازگار بگیرید؛ کلید رمزنگاری فعلی را حفظ کنید.
2. نسخه پشتیبان را با `platform-verify-backup.ts` بررسی و بازیابی را ابتدا در Staging امتحان کنید.
3. پیش از جابه‌جایی نهایی، دریافت نوشتن جدید و worker قدیمی را متوقف و Backup نهایی بگیرید.
4. دیتابیس و پوشه رسانه را به volume جدید منتقل کنید؛ مالک فایل‌ها باید UID/GID 1000 باشد. فایل SQLite زنده را بدون backup API یا توقف سرویس کپی نکنید.
5. هم‌زمان دو استقرار مستقل را نویسنده دیتابیس کسب‌وکار قرار ندهید. حجم‌ها و مانده‌ها را پیش و پس از انتقال تطبیق دهید.
6. Nginx میزبان را به پورت loopback محیط متصل کنید؛ گواهی SSL موجود روی میزبان باقی می‌ماند.
7. `/api/health`، ورود، سفارش آزمایشی، سلامت worker و نمایش دامنه را بررسی کنید. از `docker compose down -v` روی Production استفاده نکنید.

در نصب تازه، ساخت نخستین مدیر با `docker compose ... exec web npm run platform:setup` انجام می‌شود. فایل موقت `.platform-bootstrap.txt` داخل همان کانتینر web ساخته می‌شود؛ اپراتور آن را فقط روی سرور بخواند، رمز را تغییر دهد، 2FA را فعال کند و فایل موقت را حذف کند. هیچ رمز مدیریتی در مخزن قرار ندارد.

## Reverse Proxy و اعتماد به IP

پورت کانتینر فقط روی `127.0.0.1` منتشر می‌شود. `TRUST_PROXY=0` پیش‌فرض است؛ فعال‌کردن اعتماد به هدر IP مستلزم تنظیم صحیح real-IP در Nginx و محدودکردن منبع هدرهای Cloudflare است.

Compose حد فایل لاگ و healthcheck را تنظیم می‌کند. وضعیت ناموفق healthcheck به‌تنهایی کانتینر را restart نمی‌کند؛ هشدار بیرونی و اقدام اپراتور لازم است. `restart: unless-stopped` برای خروج process اعمال می‌شود.

## Backup و Recovery

اجرای backup با profile نگهداری، پس از راه‌اندازی محیط:

```bash
docker compose --env-file /secure/homa-staging.env -p homa-staging --profile maintenance run --rm backup
```

Job باید روی میزبان زمان‌بندی و نسخه‌های خروجی به مقصد جداگانه و رمزگذاری‌شده منتقل شوند. volume پشتیبان روی همان میزبان در برابر از دست رفتن کل سرور کافی نیست. اسکریپت checksum و SQLite integrity را بررسی می‌کند؛ آزمون بازیابی داده واقعی سرور همچنان لازم است.

## منابع پیاده‌سازی

- https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/
- https://nextjs.org/docs/app/guides/self-hosting

## آزمون بازیابی کپی پشتیبان

```bash
npm run platform:verify-backup -- /absolute/path/to/backup
npm run platform:restore-drill -- /absolute/path/to/backup
```

فرمان دوم یک کپی موقت مستقل می‌سازد، مهاجرت را اعمال می‌کند، سلامت و کلیدهای خارجی دیتابیس، رمزگشایی کلیدهای سرویس و 2FA و تطبیق مانده کیف پول با دفتر را بررسی می‌کند؛ فایل زنده را بازنویسی نمی‌کند و کپی موقت را در پایان حذف می‌کند. این فرمان برای rehearsal است؛ انتخاب snapshot برای بازگرداندن Production یک عملیات جداست. Backup شامل کلید خصوصی است؛ دسترسی و نگهداری آن باید محدود باشد.

## بررسی محلی پس از build

```bash
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

در ترمینال دوم:

```bash
npm run platform:benchmark -- http://127.0.0.1:3000
```

این اسکریپت ۱۲۰ درخواست خواندنی با هم‌زمانی ۶ به endpointهای عمومی می‌فرستد و تنها آدرس loopback را می‌پذیرد. نتیجه، آزمون سبک محلی است و جای آزمون ظرفیت با داده و منابع Production را نمی‌گیرد.

## دامنه فعلی homanets.com

`deploy/nginx-homanets.conf` نمونه اتصال گواهی موجود همین دامنه به پورت ۳۰۰۰ است و www را به دامنه اصلی هدایت می‌کند تا Origin نوشتن API یکسان باشد. برای این الگو، `APP_ORIGIN=https://homanets.com` است. پیش از جایگزینی، تنظیم فعلی میزبان را پشتیبان بگیرید؛ دو server block هم‌نام را هم‌زمان فعال نگذارید. پس از نصب تنظیم، ابتدا `nginx -t` و سپس reload انجام می‌شود. این فایل در محیط فعلی روی Nginx واقعی اجرا نشده است.
