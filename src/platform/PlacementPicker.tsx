"use client";
import {useState} from "react";
import {amount} from "./client";
type Slot={desk:number;value?:number;label?:string;parentPosition?:number;parentActive?:boolean;side?:string;enabled:boolean;occupied:boolean};
export function PlacementPicker({placement,onSave}:{placement:{slots:Slot[];nextDesk:number|null;mandatory?:boolean};onSave:(value:number|null)=>Promise<void>}) {
  const [value,setValue]=useState(placement.nextDesk===null?"":String(placement.nextDesk)),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const slot=placement.slots.find(s=>String(s.value??s.desk)===value);
  return <form className="portal-form placement-picker" onSubmit={async e=>{e.preventDefault();if(busy||!value)return;setBusy(true);setError("");try{await onSave(value==="auto"?null:Number(value));}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}>
    <label>محل ورودی بعدی<select required value={value} disabled={busy} onChange={e=>{setValue(e.target.value);setError("");}}><option value="">انتخاب کنید</option>{!placement.mandatory&&<option value="auto">خودکار از چپ به راست</option>}{placement.slots.filter(s=>s.enabled&&!s.occupied).map(s=><option key={s.value??s.desk} value={s.value??s.desk}>{s.label||"جایگاه "+amount(s.desk)}</option>)}</select></label>
    {slot&&<section className="placement-preview full" aria-label="پیش‌نمایش چیدمان" aria-live="polite"><h4>پیش‌نمایش چیدمان</h4><div className="placement-preview-route"><span>حساب شما</span><span aria-hidden="true">↓</span><strong>جایگاه {amount(slot.parentPosition??slot.desk)} · {slot.side==="right"?"راست":"چپ"}</strong><span aria-hidden="true">↓</span><span>عضو جدید</span></div><p>{slot.parentActive?"جایگاه مقصد فعال است؛ حجم خریدهای واجد شرایط پس از ثبت عضو محاسبه می‌شود.":"جایگاه مقصد خاموش است؛ خریدهای پیش از فعال‌شدن آن برای این جایگاه پورسانت ندارند."}</p><small>این پیش‌نمایش است؛ تا ثبت محل، انتخاب ذخیره نمی‌شود. ثبت‌نام عضو، این محل را مصرف می‌کند.</small></section>}
    {value==="auto"&&<p className="portal-notice full">محل عضو هنگام ثبت‌نام بر اساس ظرفیت همان زمان تعیین می‌شود.</p>}
    {error&&<p role="alert" className="portal-error full">{error}</p>}<button className="portal-button" disabled={busy||!value}>{busy?"در حال ثبت…":"ثبت محل رفرال بعدی"}</button>
  </form>;
}
