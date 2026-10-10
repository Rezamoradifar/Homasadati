"use client";
import {checkedInvitation,InvitationNotReady} from "./checked-invitation";
import {useState} from "react";
import Localized from "../i18n/Localized";
import {amount} from "./client";
import type {GuideStep} from "./start-guide-model";
const statuses={done:"انجام‌شده",action:"نیازمند اقدام",pending:"در انتظار"};
export function MemberStartGuide({guide,code,onNavigate}:{guide:{steps:GuideStep[];completed:number;total:number};code:string;onNavigate:(tab:string)=>void}) {
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState(""),[manualLink,setManualLink]=useState("");
  async function copy() {
    if(busy)return;setBusy(true);setManualLink("");
    try {
      const {link}=await checkedInvitation();
      try {await navigator.clipboard.writeText(link);setNotice("لینک کپی شد؛ پس از ثبت‌نام عضو جدید، وضعیت راهنما به‌روز می‌شود.");}
      catch {setManualLink(link);setNotice("کپی خودکار ممکن نشد؛ لینک را از کادر زیر کپی کنید.");}
    } catch(error){setNotice((error as Error).message);if(error instanceof InvitationNotReady)onNavigate("network");}
    finally{setBusy(false);}
  }
  return <Localized><section className="portal-card member-start-guide" aria-label="راهنمای شروع فعالیت">
    <h2>راهنمای شروع فعالیت</h2>
    <p>وضعیت واقعی حساب و قدم‌های بعدی شما، در یک نگاه.</p>
    <details open={guide.completed<guide.total}><summary><span>مراحل شروع</span><strong>{amount(guide.completed)} / {amount(guide.total)} مرحله کامل شده</strong></summary>
      <progress value={guide.completed} max={guide.total} aria-label="پیشرفت مراحل شروع"/>
      <ol>{guide.steps.map((step,i)=><li key={step.id} className={"guide-step "+step.status}>
        <span className="guide-number" aria-hidden="true">{step.status==="done"?"✓":amount(i+1)}</span>
        <div className="guide-step-content"><div><h3>{step.title}</h3><span className={"guide-status "+step.status}>{statuses[step.status]}</span></div><p>{step.description}</p></div>
        <button type="button" className="portal-button secondary" disabled={step.copy&&busy} onClick={()=>step.copy?void copy():onNavigate(step.tab)}>{step.label}</button>
      </li>)}</ol>
      <p role="status" className="guide-notice">{notice}</p>
      {manualLink && <label className="guide-manual-link">لینک دعوت<input aria-label="لینک دعوت برای کپی دستی" value={manualLink} readOnly dir="ltr" translate="no" onFocus={e=>e.currentTarget.select()}/></label>}
      <div className="guide-reports"><button type="button" className="portal-button secondary" onClick={()=>onNavigate("commissions")}>سابقه و زمان آزادسازی</button></div>
    </details>
  </section></Localized>;
}
