"use client";
import {amount,RecordData} from "./client";
export function PurchaseActivationReceipt({receipt}:{receipt?:RecordData|null}) {
  if(!receipt)return null;
  return <section className="purchase-activation-receipt"><h3>وضعیت جایگاه‌های حساب پس از خرید</h3><p>این وضعیت فعلی حساب است؛ جایگاه‌های قبلی و فعال‌سازی مدیر را هم شامل می‌شود.</p><dl><div><dt>جایگاه‌های فعال</dt><dd>{receipt.activePositions.length?receipt.activePositions.map((n:number)=>amount(n)).join("، "):"هنوز جایگاهی فعال نیست"}</dd></div><div><dt>ظرفیت شاخه‌های دعوت</dt><dd>{amount(receipt.referralCapacity)}</dd></div><div><dt>سقف مجموع پاداش هفتگی</dt><dd>{amount(receipt.weeklyCapToman)} تومان</dd></div></dl><p>برای هر ثبت‌نام، محل رفرال بعدی را انتخاب کنید. سقف پاداش به معنی درآمد قطعی نیست.</p>{!receipt.live&&<p>تسویه باشگاه هنوز فعال نیست.</p>}<a href="/account?tab=seven-card-plan">مشاهده جزئیات جایگاه‌ها</a></section>;
}
