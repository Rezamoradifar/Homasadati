import {notificationSms} from "./message-presentation";
import { randomUUID } from "node:crypto";
import { renderEmail, type EmailBrand } from "./email-template";
import { now, one, run } from "./schema";

/** First contact with a new member: an in-app notice and, if they allow
 * email, a welcome email with their referral code and first steps. The email
 * is queued in the outbox with a small JSON body that marks its template. */
const TITLE = "به هما نت خوش آمدید";

export function welcomeMember(userId: string) {
  const u = one("SELECT * FROM p_users WHERE id=?", userId);
  if (!u) return;
  const preferences = JSON.parse(u.preferences);
  if (preferences.inApp)
    run(
      "INSERT INTO p_notifications VALUES(?,?,?,?,NULL,?)",
      randomUUID(),
      userId,
      TITLE,
      `عضویت شما در باشگاه مشتریان هما نت انجام شد. کد معرف شما ${u.referral_code} است؛ پیش از ارسال دعوت، ظرفیت معرفی را فعال و محل ورودی بعدی را در بخش «شبکه و دعوت» انتخاب کنید. برای برداشت از کیف پول، تأیید دومرحله‌ای را از بخش امنیت حساب فعال کنید.`,
      now(),
    );
  if (preferences.email && u.email)
    run(
      "INSERT INTO p_outbox(id,user_id,channel,target,subject,body,created_at) VALUES(?,?,?,?,?,?,?)",
      randomUUID(),
      userId,
      "email",
      u.email,
      TITLE,
      JSON.stringify({ template: "welcome", name: u.name, code: u.referral_code }),
      now(),
    );
  if (preferences.sms && u.phone)
    run("INSERT INTO p_outbox(id,user_id,channel,target,subject,body,created_at) VALUES(?,?,?,?,?,?,?)",randomUUID(),userId,"sms",u.phone,TITLE,JSON.stringify({template:"welcome",name:u.name,code:u.referral_code}),now());

}

export function isWelcomeJob(body: string) {
  return body.startsWith('{"template":"welcome"');
}

export function welcomeEmail(body: string, brand: EmailBrand) {
  const { name, code } = JSON.parse(body) as { name: string; code: string };
  const origin = brand.origin.replace(/\/$/, "");
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return renderEmail(
    {
      subject: `${first ? first + " عزیز، " : ""}به خانوادهٔ ${brand.name} خوش آمدید`,
      preheader: `عضویت شما انجام شد؛ کد معرف شما ${code} است.`,
      heading: `${first ? first + " عزیز، " : ""}به ${brand.name} خوش آمدید`,
      paragraphs: [
        `عضویت شما در باشگاه مشتریان ${brand.name} با موفقیت انجام شد و حساب کاربری‌تان آماده است.`,
        "پیش از ارسال دعوت، ظرفیت معرفی را فعال و محل ورود عضو بعدی را در پنل انتخاب کنید. کد معرف اختصاصی شما:",
      ],
      code,
      button: { label: "ورود به پنل کاربری", url: origin + "/account" },
      steps: {
        title: "سه گام برای شروع",
        items: [
          "از بخش امنیت حساب، تأیید دومرحله‌ای را فعال کنید؛ برای برداشت از کیف پول لازم است.",
          `در فروشگاه ${brand.name} خرید کنید؛ هر ۱۰ میلیون تومان خرید واجد شرایط و پرداخت‌شده، یک جایگاه را فعال می‌کند.`,
          "در بخش «شبکه و دعوت»، محل ورودی بعدی را انتخاب و سپس لینک دعوت را ارسال کنید. بعد از ثبت‌نام هر عضو، برای نفر بعد دوباره محل انتخاب کنید.",
        ],
      },
      note: "اگر این عضویت را شما انجام نداده‌اید، لطفاً با پشتیبانی هما نت تماس بگیرید.",
    },
    brand,
  );
}

export function welcomeSms(body:string,brand:string,origin:string) {
  const {name}=JSON.parse(body) as {name:string};
  const first=String(name||'').trim().split(/\s+/)[0];
  return notificationSms(TITLE,(first?first+' عزیز، ':'')+'عضویت شما انجام شد. از پنل، مشخصات حساب را تکمیل کنید؛ پیش از ارسال دعوت، محل ورودی بعدی را انتخاب کنید.',brand,origin);
}
