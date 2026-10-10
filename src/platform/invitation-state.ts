import type { RecordData } from "./client";

export const invitationCopy = {
  ready: {label:"فعال؛ آمادهٔ دعوت",text:"لینک دعوت آماده است. پس از ثبت هر عضو، محل ورود نفر بعدی را انتخاب کنید."},
  placement_required: {label:"منتظر انتخاب محل ورود",text:"جایگاه‌های شما فعال‌اند؛ برای پذیرش دعوت، محل ورود نفر بعدی را انتخاب و ثبت کنید."},
  purchase_required: {label:"نیاز به فعال‌سازی جایگاه",text:"برای بازشدن ظرفیت دعوت، ابتدا خرید واجد شرایط انجام دهید یا با پشتیبانی دربارهٔ فعال‌سازی حساب هماهنگ کنید."},
  capacity_full: {label:"ظرفیت دعوت تکمیل شده",text:"همهٔ شاخه‌های در دسترس پر شده‌اند؛ با فعال‌کردن جایگاه بعدی، ظرفیت دعوت افزایش می‌یابد. حساب هفت‌جایگاهی حداکثر هشت شاخه دارد."},
  blocked: {label:"دعوت متوقف است",text:"حساب امکان پذیرش عضو جدید ندارد؛ با پشتیبانی تماس بگیرید."},
} as const;
export type InvitationState = keyof typeof invitationCopy;
export function invitationState(data: RecordData): InvitationState {
  if (data.state && data.state in invitationCopy) return data.state;
  if (data.active) return "ready";
  if (data.placement) {
    const free = data.placement.slots.filter((s:RecordData)=>s.enabled && !s.occupied);
    if (free.length && data.placement.nextDesk === null) return "placement_required";
    if (!data.placement.slots.some((s:RecordData)=>s.enabled)) return "purchase_required";
    if (!free.length) return "capacity_full";
  }
  return data.requiresPurchase ? "purchase_required" : "blocked";
}
