"use client";
import {amount,RecordData} from "./client";
export function AccountAlerts({guide,company,onNavigate}:{guide:RecordData;company:RecordData|null;onNavigate:(tab:string)=>void}) {
  const alerts=(guide?.steps||[]).filter((s:RecordData)=>s.status==='action'&&(s.id==='profile'||s.id==='placement'));
  const nearing=company&&!company.exempt&&company.status==='grace'&&company.remainingDays<=7;
  if(!alerts.length&&!nearing)return null;
  return <section className="portal-card account-alerts" aria-label="اقدام‌های لازم حساب"><h2>اقدام‌های لازم حساب</h2><ul>{alerts.map((s:RecordData)=><li key={s.id}><p>{s.description}</p><button className="portal-button secondary" onClick={()=>onNavigate(s.tab)}>{s.label}</button></li>)}{nearing&&<li><p>مهلت فعال‌سازی جایگاه هدیه رو به پایان است؛ روزهای باقی‌مانده: {amount(company.remainingDays)}</p><button className="portal-button secondary" onClick={()=>onNavigate("catalog")}>تکمیل خرید واقعی</button></li>}</ul></section>;
}
