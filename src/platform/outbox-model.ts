import { z } from "zod";
import { id } from "./validation";

export const outboxRetrySchema = z
  .object({
    id,
    attempts: z.number().int().min(8).max(10),
    reason: z.string().trim().min(5).max(200),
    checkedDelivery: z.literal(true),
  })
  .strict();

export const outboxErrors: Record<string, string> = {
  email_not_configured: "تنظیمات ایمیل کامل نیست.",
  sms_not_configured: "تنظیمات پیامک کامل نیست.",
  provider_rejected: "سرویس ارسال درخواست را نپذیرفت.",
  provider_unavailable:
    "پاسخ سرویس ارسال دریافت نشد؛ سابقه ارسال را بررسی کنید.",
  delivery_failed: "ارسال کامل نشد؛ سابقه ارسال را بررسی کنید.",
  recipient_changed: "اطلاعات تماس گیرنده تغییر کرده است.",
  notifications_disabled: "گیرنده این نوع اعلان را غیرفعال کرده است.",
  unsupported_channel: "روش ارسال پشتیبانی نمی‌شود.",
};
