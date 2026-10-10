/** Shared plain-text copy and navigation. No user data, provider credentials or HTML. */
export function messagePresentation(title:string,body:string) {
  let group='حساب کاربری',tab='notifications',action='مشاهده پیام‌ها';
  if(title.includes('سفارش')||title.includes('پرداخت')){group='خرید و سفارش';tab='orders';action='پیگیری سفارش‌ها';}
  else if(title.includes('پشتیبانی')){group='پشتیبانی';tab='tickets';action='مشاهده درخواست‌ها';}
  else if(title.includes('برداشت')||title.includes('بانکی')||title.includes('بازگشت وجه')){group='کیف پول';tab='wallet';action='مشاهده کیف پول';}
  else if(title.includes('پورسانت')||title.includes('پاداش')||title.includes('تسویه')||title.includes('کارت باشگاه')){group='باشگاه مشتریان';tab='seven-card-plan';action='گزارش جایگاه‌ها و پاداش';}
  else if(title.includes('خوش آمدید')){group='خوش‌آمدگویی';tab='dashboard';action='شروع از پنل کاربری';}
  let text=body.trim();
  if(title==='وضعیت سفارش تغییر کرد') {
    const statuses:Record<string,string>={shipped:'سفارش شما ارسال شد. وضعیت و جزئیات ارسال در بخش سفارش‌ها قابل پیگیری است.',delivered:'سفارش شما تحویل‌شده ثبت شد. جزئیات در بخش سفارش‌ها در دسترس است.'};
    text=statuses[text]||text;
  }
  if(title==='وضعیت برداشت تغییر کرد') {
    const statuses:Record<string,string>={approved:'درخواست برداشت شما تأیید شد و در انتظار پرداخت است.',rejected:'درخواست برداشت شما تأیید نشد. دلیل و وضعیت موجودی را در کیف پول بررسی کنید.',paid:'پرداخت درخواست برداشت شما ثبت شد. جزئیات و شماره پیگیری در کیف پول در دسترس است.'};
    text=statuses[text]||text;
  }
  if(title==='پرداخت سفارش تأیید شد'&&!text.startsWith('پرداخت خرید شما با موفقیت ثبت شد.'))text='پرداخت خرید شما با موفقیت ثبت شد. محصول یا خدمت: '+text;
  return {group,tab,action,text};
}
export function notificationSms(title:string,body:string,brand:string,origin:string) {
  const message=messagePresentation(title,body);
  const clean=(value:string)=>value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  const preview=Array.from(clean(message.text));
  const text=preview.length>240?preview.slice(0,237).join('')+'…':preview.join('');
  return [clean(brand)+' | '+clean(title),text,'پیگیری: '+origin.replace(/\/$/,'')+'/account?tab='+message.tab].join('\n');
}
