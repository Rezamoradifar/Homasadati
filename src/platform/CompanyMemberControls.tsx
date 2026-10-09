"use client";
import { ManagerActivationBadge } from "./ManagerActivationBadge";
import {useState,useRef} from "react";
import Localized from "../i18n/Localized";
import {useData,DataState} from "./Widgets";
import {api,amount,date} from "./client";
const historyLabels:Record<string,string>={'company-member.credit':'شارژ اعتبار خرید','company-member.positions':'تخصیص جایگاه شرکت','company-member.archive':'حذف از کاربران فعال','company-member.restore':'بازیابی حساب حذف‌شده','company-member.activate':'فعال‌سازی حساب','company-member.profile':'ویرایش نام و نام خانوادگی','company-position.qualified':'شرط خرید واقعی تکمیل شد','company-position.suspended':'جایگاه شرکتی معلق است','marketer-office.access':'ویرایش دسترسی دفتر کار','user.update':'ویرایش کاربر'};
const actions=[['activate','فعال‌سازی حساب'],['positions','تخصیص جایگاه شرکت'],['credit','شارژ اعتبار خرید'],['profile','ویرایش نام و نام خانوادگی'],['archive','حذف از کاربران فعال'],['restore','بازیابی حساب حذف‌شده']] as const;
export function CompanyMemberControls({userId,onChange}:{userId:string;onChange:()=>void}){
 const [tick,setTick]=useState(0),[action,setAction]=useState('positions'),[desks,setDesks]=useState(3),[credit,setCredit]=useState(''),[name,setName]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const request=useRef({intent:'',eventId:''});
 const state=useData('admin/company-members?userId='+userId,tick);
 return <Localized><section className="portal-card company-member-controls"><h3>مدیریت حساب و جایگاه شرکتی</h3><DataState state={state}>{d=><>
 <ManagerActivationBadge active={d.managerActivated}/><p>اعتبار خرید شرکت: <b>{amount(d.creditToman)} تومان</b> · {d.archived?'حذف‌شده از فهرست فعال':d.blocked?'حساب مسدود':'حساب فعال'}</p>
 {d.positions&&<p>{d.positions.exempt ? "جایگاه شرکتی دائمی: "+d.positions.desks+" · بدون شرط خرید و مهلت زمانی" : <>جایگاه شرکتی: {d.positions.desks} · مهلت: {date(d.positions.deadline)} · خرید واقعی: {amount(d.positions.realPurchaseToman)} از ۲۰ میلیون تومان</>}</p>}
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');setNotice('');try{const intent={userId,action,reason,...(action==='positions'?{desks}:{}),...(action==='credit'?{amount:Number(credit)}:{}),...(action==='profile'?{name}: {})};if(request.current.intent!==JSON.stringify(intent))request.current={intent:JSON.stringify(intent),eventId:crypto.randomUUID()};await api('admin/company-members','POST',{...intent,eventId:request.current.eventId});request.current={intent:'',eventId:''};setTick(n=>n+1);onChange();setNotice('تغییر ثبت شد');}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}>
 <label>عملیات<select value={action} onChange={e=>setAction(e.target.value)}>{actions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
 {action==='positions'&&<><label>تعداد جایگاه شرکتی<select value={desks} onChange={e=>setDesks(Number(e.target.value))}>{[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n}</option>)}</select></label><p>{d.positions?.exempt ? "این حساب از شرط خرید و مهلت زمانی معاف است." : "کاربر باید ظرف ۳۵ روز با ۲۰ میلیون تومان خرید واقعی، دو جایگاه اول را فعال کند؛ وگرنه جایگاه‌های شرکتی معلق می‌شوند."}</p></>}
 {action==='credit'&&<><label>اعتبار خرید به تومان<input type="number" inputMode="numeric" min={1} max={1000000000000} value={credit} onChange={e=>setCredit(e.target.value)} required/></label><p>این اعتبار فقط برای خرید است؛ قابل برداشت نیست و پورسانت یا شرط خرید واقعی ایجاد نمی‌کند.</p></>}
 {action==='profile'&&<label>نام و نام خانوادگی<input value={name} onChange={e=>setName(e.target.value)} maxLength={200} required/></label>}
 {action==='archive'&&<p>دسترسی حساب قطع می‌شود. سوابق مالی، سفارش‌ها و جایگاه شبکه برای بررسی و بازیابی حفظ می‌شوند.</p>}
 <label>دلیل تغییر<input value={reason} onChange={e=>setReason(e.target.value)} required maxLength={200}/></label><button disabled={busy||!reason.trim()} className="portal-button">ثبت تغییر</button>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </form><details><summary>تاریخچه مدیریت این کاربر</summary><ul>{d.history.map((h:any,i:number)=><li key={i}><time>{date(h.created_at)}</time> · <span>{historyLabels[h.action]||"تغییرات حساب"}</span> · {h.actor} · {h.reason}</li>)}</ul></details>
 </>}</DataState></section></Localized>;
}
