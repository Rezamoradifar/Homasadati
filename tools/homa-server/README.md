# اتصال خصوصی مدیریت هما

این بسته یک MCP server با ارتباط `stdio` و شش ابزار محدود است. روی VPS فعلی
Ubuntu/Debian با Node 22+ و systemd نصب می‌شود؛ خود برنامه هما را ارتقا یا restart
نمی‌کند. اتصال از طریق Secure MCP Tunnel رسمی OpenAI و فقط با خروجی HTTPS برقرار
می‌شود. هیچ پورت مدیریتی عمومی باز نمی‌شود. آدرس سایت یا IP سرور، URL این MCP نیست.

## نصب اولیه از ترمینال VPS

1. در [صفحه تونل‌ها](https://platform.openai.com/settings/organization/tunnels)
   تونلی برای همان organization و workspace گفتگو ایجاد کنید. دسترسی ایجاد تونل
   نیازمند Tunnels Read + Manage است؛ اجرا و اتصال نیازمند Read + Use است.
2. یک **runtime API key** با دسترسی Read + Use بسازید:
   [کلیدهای runtime](https://platform.openai.com/settings/organization/api-keys).
   کلید admin برای daemon مناسب نیست. کلید را در گفتگو نفرستید.
3. دستور زیر را با SHA کامل و منتشرشده **این بسته اتصال** اجرا کنید. مقدار
   `BRIDGE_COMMIT` نمونه است و باید جایگزین شود. اسکریپت شناسه تونل و کلید runtime
   را در خود ترمینال VPS می‌پرسد؛ ورود کلید مخفی است و در history فرمان نمی‌آید.

```bash
bridge_release=BRIDGE_COMMIT
bridge_installer=$(mktemp /root/homa-mcp-install.XXXXXXXX.sh)
curl -fSL --connect-timeout 10 --max-time 60 \
  "https://raw.githubusercontent.com/Rezamoradifar/Homasadati/$bridge_release/scripts/install-homa-mcp.sh" \
  -o "$bridge_installer" &&
bash -n "$bridge_installer" &&
bash "$bridge_installer" "$bridge_release"
```

نصب‌کننده جدیدترین نسخه رسمی `openai/tunnel-client` را دریافت و SHA-256 آن را با
digest متادیتای GitHub تطبیق می‌دهد. این بررسی، امضای مستقل ناشر نیست. نسخه و digest
نصب‌شده در `/usr/local/lib/homa-mcp/tunnel-client.release.json` ثبت می‌شود. وابستگی‌های
Node با lockfile ثابت، کاربر غیر root و lifecycle scripts غیرفعال نصب می‌شوند.

تنظیمات در `/etc/homa-mcp/config.json` و کلید در `/etc/homa-mcp/runtime-key` قرار
می‌گیرد؛ هر دو root-only هستند و با systemd credentials در اختیار daemon قرار
می‌گیرند. کلید از محیط فرزند MCP حذف می‌شود. اگر نصب همان SHA قطع شد، تکرار دستور
آن را تکمیل می‌کند؛ تعویض نسخه متفاوت باید جداگانه بررسی شود.

نصب موفق باید هر دو پیام `HOMA_MCP_LOCAL_CHECK_OK` و `HOMA_TUNNEL_READY` را بدهد.
بررسی اول واقعاً stdio را initialize، ابزارها را discover و `homa_status` را از
مرز sudo اجرا می‌کند. بررسی دوم readiness تونل است. هیچ‌کدام به‌تنهایی به معنی
اتصال حساب ChatGPT نیست.

## اتصال در ChatGPT

در [Plugins](https://chatgpt.com/plugins) → New Plugin:

| فیلد | مقدار |
| --- | --- |
| Name | Homa Server |
| Connection | Tunnel |
| Tunnel | شناسه ایجادشده، پس از آماده شدن daemon |
| Authentication | No authentication برای MCP داخلی stdio؛ دسترسی از طریق تونل احراز می‌شود |

اطلاعیه دسترسی افزونه را بررسی و تأیید کنید، سپس Create و Install را بزنید.
در گفتگو `@Homa Server` را انتخاب و ابتدا `homa_status` را فراخوانی کنید. اتصال
زنده فقط پس از موفقیت این فراخوانی تأیید شده است. OAuth جداگانه‌ای در این بسته
پیاده نشده؛ تغییر فرم به OAuth آن را ایجاد نمی‌کند. دسترسی تونل را به مدیران موردنظر
محدود کنید. اگر تونل در workspace دیده نمی‌شود، association و نقش‌ها را در Platform
بررسی کنید؛ به جای آن آدرس سایت یا یک پورت بدون احراز هویت وارد نکنید.

## ابزارها و مرز دسترسی

| ابزار | رفتار |
| --- | --- |
| `homa_status` | وضعیت دو سرویس، HEAD، SHA مجاز، HTTP health و نام لاگ‌ها/کارها |
| `homa_deploy_log` | حداکثر ۱۵۰ خط از لاگ‌های نصب با نام محدود؛ بدون مسیر دلخواه |
| `homa_job_status` | نتیجه و خروجی محدود یک کار؛ تشخیص worker قطع‌شده |
| `homa_backup` | پشتیبان محلی + restore drill، فقط اگر نسخه پشتیبانی‌کننده نصب شده باشد |
| `homa_upgrade` | تنها SHA مورد تأیید root، با نصب مرحله‌ای و حفظ merchant و schedule |
| `homa_restart` | فقط restart سرویس app یا worker هما |

نسخه مجاز اولیه ارتقا `ca3c7e7d57a9070e9e9584f238f9830702c3d364` است. تغییر آن نیازمند
بازبینی نسخه و ویرایش root-owned `approved_release` در config است؛ خود MCP اجازه
تغییر pin، تنظیمات، رمزها، فایل‌های دلخواه، اجرای shell دلخواه، ارسال پیام یا تغییر
منطق اقتصادی را ندارد. دستور root ارتقا فقط از installer کپی‌شده هنگام نصب bridge
استفاده می‌کند، نه اسکریپت انتخاب‌شده توسط ورودی ابزار.

کاربر `homa-mcp` عضو گروه app یا sudo نیست. sudoers فقط اجرای دقیق
`/usr/bin/python3 -I /usr/local/lib/homa-mcp/helper.py` را مجاز می‌کند. عملیات از JSON
با schema محدود خوانده و دوباره در مرز root اعتبارسنجی می‌شود. همه فایل‌های اجرایی
root-owned و غیرقابل‌نوشتن برای daemon هستند. عملیات نوشتن با annotations مشخص‌اند؛
تنظیمات تأیید اقدام ChatGPT همچنان اعمال می‌شوند.

کارهای نوشتنی با `systemd-run` از daemon جدا می‌شوند؛ قطع گفتگو یا restart تونل
آن‌ها را متوقف نمی‌کند. `request_id` باید ۳۲ رقم hex تصادفی باشد و برای retry همان
کار ثابت بماند. هم‌زمان تنها یک کار bridge فعال است و backup/restart با lock نصب
بیرونی نیز هماهنگ‌اند. upgrade از lock خود installer استفاده می‌کند. کارهای ارتقا
خودکار با timeout کشته نمی‌شوند تا rollback وسط اجرا قطع نشود؛ برای کار گیرکرده
خروجی و unit مربوط را بررسی کنید. قطع برق یا kill خارجی ممکن است بررسی دستی لازم
داشته باشد؛ وضعیت interrupted موفقیت محسوب نمی‌شود.

لاگ‌ها داده غیرقابل‌اعتمادند. مقادیر شناخته‌شده env، token، شماره همراه و ایمیل تا
حد ممکن پوشانده می‌شوند؛ این پاک‌سازی تضمین حذف همه نوع اطلاعات حساس نیست. ابزار
به .env، محتوای backup، database، journal کامل یا لاگ درخواست‌های مشتری دسترسی
نمایشی نمی‌دهد. فایل‌های خام کارها زیر `/var/lib/homa-mcp-jobs` فقط برای root هستند.
حجم پشتیبان‌ها و سوابق کار را مدیر سرور دوره‌ای بررسی کند؛ حذف خودکار اضافه نشده است.

## تشخیص خطای فعلی و قطع دسترسی

پس از اتصال، ابتدا `homa_status` و سپس
`homa_deploy_log(name="homa-ops.f6GjDt4u.log")` را بخوانید. عکس موجود فقط Exit 3
را نشان می‌دهد و علتش مشخص نیست؛ ارتقا را بدون بررسی دوباره شروع نکنید.

```bash
systemctl status homa-mcp.service --no-pager
curl -fsS http://127.0.0.1:18793/readyz
# فقط در ترمینال خود سرور بررسی شود؛ لاگ خام ممکن است اطلاعات خصوصی داشته باشد:
journalctl -u homa-mcp.service -n 40 --no-pager
# قطع اتصال، بدون متوقف کردن app یا کار ارتقای در حال اجرا:
systemctl disable --now homa-mcp.service
```

برای لغو کامل، کلید runtime و دسترسی/تونل را در Platform لغو کنید. کلید جدید را
فقط از طریق فایل root-only در VPS جایگزین و سرویس تونل را restart کنید. یک tunnel ID
با stdio نباید هم‌زمان دو daemon فعال داشته باشد.

## آزمایش توسعه

```bash
cd tools/homa-server
npm ci --ignore-scripts --no-audit --no-fund
npm test
python3 -m unittest test_helper.py -v
bash -n ../../scripts/install-homa-mcp.sh
```

آزمون‌ها شامل مذاکره واقعی پروتکل MCP و stdio، validation، annotation، عدم اجرای
ورودی نامعتبر، symlink/FIFO، پوشاندن نمونه رمزها، dedup، جلوگیری از overlap، تشخیص
worker قطع‌شده و خطای ارتقا هستند. سرویس‌های VPS و auth واقعی تونل در محیط آزمایش
موجود نیستند؛ آن بخش در نصب و اولین فراخوانی از ChatGPT بررسی می‌شود.

منابع رسمی: [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)،
[tunnel-client](https://github.com/openai/tunnel-client)،
[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x).
