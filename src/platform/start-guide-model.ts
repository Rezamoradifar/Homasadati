export type GuideStatus = "done" | "action" | "pending";
export type GuideStep = {id:string;title:string;status:GuideStatus;description:string;label:string;tab:string;copy?:boolean};
export type GuideInput = {
  profileComplete:boolean;bankStatus:string|null;twoFactor:boolean;
  activeDesks:number;permanent:boolean;companyNeedsPurchase:boolean;
  invitationState:string;directMembers:number;hasNetworkActivity:boolean;
};
/** Explains current facts only. It never gates registration, purchasing or earnings. */
export function buildStartGuide(d:GuideInput) {
  const profileDone=d.profileComplete && d.bankStatus==="verified" && d.twoFactor;
  const needsSecurity=d.profileComplete && !d.twoFactor;
  const active=d.activeDesks>0 && !d.companyNeedsPurchase;
  const ready=d.invitationState==="ready";
  const full=d.invitationState==="capacity_full";
  const steps:GuideStep[]=[
    {id:"profile",title:"تکمیل پروفایل و اطلاعات بانکی",status:profileDone?"done":d.profileComplete && d.twoFactor && d.bankStatus==="pending"?"pending":"action",
      description:profileDone?"پروفایل تکمیل و اطلاعات بانکی تأیید شده است.":!d.profileComplete?"نام، نام خانوادگی، کشور و شهر را در پروفایل تکمیل کنید.":needsSecurity?"برای ثبت اطلاعات بانکی، تأیید دومرحله‌ای را فعال کنید.":d.bankStatus==="pending"?"اطلاعات بانکی ثبت شده و منتظر بررسی کارشناس مالی است.":d.bankStatus==="rejected"?"اطلاعات بانکی رد شده است؛ دلیل را بررسی و اطلاعات را اصلاح کنید.":"اطلاعات بانکی خود را برای بررسی و برداشت ثبت کنید.",
      label:!d.profileComplete?"تکمیل پروفایل":needsSecurity?"فعال‌سازی امنیت حساب":"اطلاعات بانکی",tab:!d.profileComplete?"profile":needsSecurity?"security":"wallet"},
    {id:"activation",title:"خرید و فعال‌کردن جایگاه",status:active?"done":"action",
      description:d.permanent && active?"جایگاه‌های این حساب دائماً فعال‌اند؛ خرید برای فعال‌سازی لازم نیست.":d.companyNeedsPurchase?"برای حفظ جایگاه‌های هدیه، شرط خرید واقعی را در مهلت درج‌شده در حساب تکمیل کنید.":active?"جایگاه شما فعال است؛ تعداد جایگاه‌ها در خلاصه حساب نمایش داده می‌شود.":"با خرید واجد شرایط، اولین جایگاه و ظرفیت دعوت باز می‌شود.",
      label:active?"مشاهده جایگاه‌ها":"خرید و فعال‌سازی",tab:active?"network":"catalog"},
    {id:"placement",title:"انتخاب محل ورود نفر بعدی",status:ready || full?"done":d.invitationState==="placement_required"?"action":"pending",
      description:ready?"محل ورود آماده است؛ بعد از ثبت هر عضو، محل نفر بعدی را انتخاب کنید.":full?"ظرفیت فعلی تکمیل است؛ جای خالی برای ورودی جدید وجود ندارد.":d.invitationState==="placement_required"?"یک شاخه خالی را انتخاب و محل ورودی بعدی را ثبت کنید.":"پس از بازشدن ظرفیت دعوت، محل ورود عضو جدید را انتخاب کنید.",label:"تنظیم محل ورود",tab:"network"},
    {id:"invite",title:"کپی لینک و دعوت عضو",status:d.directMembers>0?"done":ready?"action":"pending",
      description:d.directMembers>0?"عضو معرفی‌شده در شبکه ثبت شده است؛ دعوت‌های بعدی به محل ورود آماده نیاز دارند.":ready?"لینک آماده را برای عضو جدید بفرستید؛ این مرحله پس از ثبت‌نام او کامل می‌شود.":"برای پذیرش دعوت، ابتدا وضعیت و محل ورودی بعدی را در بخش شبکه بررسی کنید.",label:ready?"کپی لینک دعوت":"بررسی وضعیت دعوت",tab:"network",copy:ready},
    {id:"report",title:"مشاهده حجم و زمان آزادسازی پاداش",status:d.hasNetworkActivity?"done":"pending",
      description:d.hasNetworkActivity?"فعالیت مالی ثبت شده است؛ جزئیات حجم، پورسانت و زمان آزادسازی را بررسی کنید.":"گزارش آماده است؛ حجم و پاداش پس از فعالیت واجد شرایط نمایش داده می‌شود.",label:"مشاهده حجم و پاداش",tab:"binary"},
  ];
  return {steps,completed:steps.filter(s=>s.status==="done").length,total:steps.length};
}
