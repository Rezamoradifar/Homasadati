import { z } from "zod";
import { registrationEmail } from "./registration-model";

export type RegistrationMethod = "email" | "sms";

export function normalizeRegistrationDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

const phoneMessage = "شماره موبایل را با قالب ۰۹۱۲۱۲۳۴۵۶۷ یا +۹۸۹۱۲۱۲۳۴۵۶۷ وارد کنید.";
const registrationPhone = z.string().trim().max(254).transform((value) => {
  const phone = normalizeRegistrationDigits(value).replace(/[\s()\-]/g, "");
  if (/^09\d{9}$/.test(phone)) return "+98" + phone.slice(1);
  if (phone.startsWith("00")) return "+" + phone.slice(2);
  return phone;
}).refine((phone) => {
  const canonical = "+" + phone.replace(/^\+/, "");
  return /^\+?[1-9]\d{9,14}$/.test(phone)
    && (!canonical.startsWith("+98") || /^\+989\d{9}$/.test(canonical));
}, phoneMessage)
  .transform((phone) => "+" + phone.replace(/^\+/, ""));

/** Normalize a phone before the existing API validation and OTP rate limits. */
export function parseRegistrationTarget(value: string, method: RegistrationMethod): string {
  return (method === "email" ? registrationEmail : registrationPhone).parse(value);
}

const fieldMessages: Record<string, string> = {
  firstName: "نام را وارد کنید؛ حداکثر ۲۰۰ نویسه مجاز است.",
  lastName: "نام خانوادگی را وارد کنید؛ حداکثر ۲۰۰ نویسه مجاز است.",
  country: "کشور محل سکونت را وارد کنید؛ حداکثر ۲۰۰ نویسه مجاز است.",
  city: "شهر محل سکونت را وارد کنید؛ حداکثر ۲۰۰ نویسه مجاز است.",
  occupation: "زمینه فعالیت باید حداکثر ۱۲۰ نویسه باشد.",
  language: "یکی از زبان‌های فارسی، انگلیسی یا عربی را انتخاب کنید.",
  interests: "حداکثر پنج علاقه‌مندی از گزینه‌های فرم انتخاب کنید.",
  nationalId: "کد ملی باید ۱۰ رقم و معتبر باشد.",
  mobile: "شماره موبایل را به‌صورت ۱۱ رقمی با ۰۹ یا با پیش‌شماره +۹۸ وارد کنید.",
  referral: "کد دعوت باید ۴ تا ۴۰ حرف انگلیسی، عدد یا خط تیره باشد.",
  invitationMode: "روش عضویت با کد دعوت یا بدون کد دعوت را انتخاب کنید.",
  code: "کد تأیید شش‌رقمی را کامل وارد کنید.",
  challenge: "برای دریافت کد تأیید جدید، گزینه ویرایش ایمیل یا موبایل را بزنید.",
  verificationToken: "تأیید راه تماس معتبر نیست؛ گزینه تغییر روش تأیید را بزنید و دوباره کد بگیرید.",
  termsAccepted: "برای ساخت حساب، قوانین عضویت و خرید را بپذیرید.",
  privacyAccepted: "برای ساخت حساب، سیاست حریم خصوصی را بپذیرید.",
  adultConfirmed: "برای ساخت حساب، حداقل ۱۸ سال داشتن و صحت اطلاعات را تأیید کنید.",
  termsVersion: "نسخه قوانین تغییر کرده است؛ صفحه ثبت‌نام را تازه کنید.",
  captchaToken: "بررسی امنیتی را دوباره انجام دهید.",
  password: "رمز عبور باید بین ۱۲ تا ۱۲۸ نویسه باشد.",
};

/** Describe the first invalid field without including entered personal data. */
export function registrationFormError(
  error: unknown,
  method: RegistrationMethod,
  fallbackField?: string,
): { message: string; field?: string } {
  if (!(error instanceof z.ZodError)) {
    return { message: error instanceof Error ? error.message : "عملیات انجام نشد؛ دوباره تلاش کنید." };
  }
  const issue = error.issues[0];
  const path = issue?.path || [];
  const field = String(path[0] === "details" ? path[1] || "" : path[0] || fallbackField || "");
  if (field === "target") {
    return { field, message: method === "sms" ? phoneMessage : "نشانی ایمیل را کامل و با قالب name@example.com وارد کنید." };
  }
  if (Object.prototype.hasOwnProperty.call(fieldMessages, field)) {
    // Preserve precise cross-field rules such as invitation-mode mismatches.
    const message = issue?.code === "custom" && /[\u0600-\u06FF]/.test(issue.message)
      ? issue.message : fieldMessages[field];
    return { field, message };
  }
  return { message: "اطلاعات فرم با این نسخه صفحه سازگار نیست؛ صفحه ثبت‌نام را تازه کنید و دوباره تلاش کنید." };
}
