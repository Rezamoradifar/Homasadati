import {writeFileSync} from 'node:fs';
import {renderEmail,type EmailBrand} from '../src/platform/email-template';
import {welcomeEmail,welcomeSms} from '../src/platform/welcome';
import {messagePresentation,notificationSms} from '../src/platform/message-presentation';
// Fictional examples only. Running this script never queues or sends messages.
const brand:EmailBrand={name:'هما نت',origin:'https://homanets.com',direction:'rtl',footer:['هما نت · باشگاه مشتریان','این پیام به‌صورت خودکار ارسال شده است.']};
const samples:[string,string][]=[
 ['پرداخت سفارش تأیید شد','محصول نمونه'],['وضعیت سفارش تغییر کرد','shipped'],['وضعیت سفارش تغییر کرد','delivered'],
 ['وضعیت برداشت تغییر کرد','approved'],['وضعیت برداشت تغییر کرد','rejected'],['وضعیت برداشت تغییر کرد','paid'],
 ['پورسانت جدید','۴٬۹۰۰٬۰۰۰ تومان در انتظار پایان مهلت لغو'],['کارت باشگاه شما به‌روز شد','کارت جوانه با ۱ میز فعال شد.'],
 ['بازگشت وجه کارت سیمرغ','مبلغ نمونه به کیف پول شما اضافه شد.'],['پاسخ پشتیبانی','پاسخ تازه‌ای برای درخواست شما ثبت شد؛ آن را در پنل پشتیبانی بخوانید.'],
 ['وضعیت درخواست پشتیبانی','وضعیت درخواست شما تغییر کرد؛ جزئیات در پنل پشتیبانی در دسترس است.'],['اطلاعیه حساب','جزئیات فعالیت حساب شما در پنل قابل مشاهده است.']
];
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const body=JSON.stringify({template:'welcome',name:'سارا نمونه',code:'hn-example'});
const preview=(title:string,sms:string,html:string)=>`<section><h2>${escape(title)}</h2><div class="channels"><div><h3>پیامک</h3><pre>${escape(sms)}</pre></div><div><h3>ایمیل</h3><iframe title="${escape(title)}" srcdoc="${escape(html)}" sandbox></iframe></div></div></section>`;
const sections=[preview('خوش‌آمدگویی',welcomeSms(body,brand.name,brand.origin),welcomeEmail(body,brand).html),...samples.map(([title,text])=>{
 const m=messagePresentation(title,text);const mail=renderEmail({subject:title+' | '+brand.name,heading:title,preheader:m.text,paragraphs:['سلام،',m.text],button:{label:m.action,url:brand.origin+'/account?tab='+m.tab},note:'جزئیات را در حساب کاربری خود بررسی کنید.'},brand);
 return preview(title,notificationSms(title,text,brand.name,brand.origin),mail.html);
})];
const html=`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>نمونه قالب پیام‌های هما نت</title><style>*{box-sizing:border-box}body{margin:0;background:#f2e8d3;color:#1e2a44;font:15px Tahoma,Arial,sans-serif;line-height:1.9}main{max-width:1100px;margin:auto;padding:20px}header{padding:24px;border-radius:18px;background:#1e2a44;color:#fff}section{margin:24px 0;padding:20px;background:white;border-radius:18px}h2{color:#0f6e72}h3{font-size:15px}.channels{display:grid;grid-template-columns:1fr 1.6fr;gap:20px;align-items:start}pre{font:15px Tahoma,Arial,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f8fa;border:1px solid #dce3e9;border-radius:16px;padding:20px;line-height:2}iframe{width:100%;height:620px;border:1px solid #dce3e9;border-radius:14px}@media(max-width:700px){main{padding:12px}.channels{grid-template-columns:1fr}section{padding:14px}}</style><main><header><h1>قالب پیام‌های هما نت</h1><p>نمونه‌های نمایشی؛ هیچ پیام یا تراکنشی ارسال نشده است.</p><p>پیامک‌ها متن ساده‌اند. ارسال با ترجیحات کاربر و تنظیمات سرویس انجام می‌شود. اعلان‌های بانکی و آزادسازی پاداش که فقط در پنل ثبت می‌شوند، همچنان خصوصی می‌مانند.</p></header>${sections.join('')}<section><h2>کدهای تأیید پیامکی</h2><p>متن واقعی کد تأیید در الگوی تأییدشده کاوه‌نگار قرار دارد. مدیر می‌تواند نام الگوی عضویت، ورود، بازیابی رمز، امنیت و راه تماس را جدا تنظیم کند. اگر نام جدا تنظیم نشده باشد، الگوی قبلی استفاده می‌شود.</p><p>متن پیشنهادی برای ثبت نزد سرویس‌دهنده:</p><pre>هما نت | تأیید حساب
کد تأیید: [کد]
اعتبار: ۵ دقیقه
این کد را در اختیار دیگران قرار ندهید.</pre></section></main></html>`;
writeFileSync('docs/message-templates-preview.html',html);
console.log('Message preview generated; no messages sent.');
