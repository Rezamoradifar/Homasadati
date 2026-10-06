"use client";
import {useState} from "react";
import Localized from "../i18n/Localized";
import LiveChart from "./LiveChart";
import {useData, DataState} from "./Widgets";
import {api, amount, RecordData} from "./client";
import {NetworkTree} from "./NetworkTree";

export function MarketerOffice({user,refresh}:{user:RecordData;refresh:number}) {
  const access=useData("marketer-office",refresh);
  return <Localized><DataState state={access}>{a => <>
    <section className="portal-card office-intro">
      <div><small>دفتر کار بازاریاب</small><h2>شبکه و عملکرد من</h2><p>فروش، پورسانت و اعضای زیرمجموعه در یک نگاه</p></div>
      <strong className="office-level">سطح دسترسی {Number(a.level).toLocaleString("fa-IR")} از ۷</strong>
    </section>
    <LiveChart office />
    <NetworkTree user={user} refresh={refresh}/>
    <OfficeNetwork userId={user.id} maxDepth={a.maxDepth} refresh={refresh}/>
  </>}</DataState></Localized>;
}
function OfficeNetwork({userId,maxDepth,refresh}:{userId:string;maxDepth:number;refresh:number}) {
  const [depth,setDepth]=useState(6),[root,setRoot]=useState(userId);
  const state=useData(`marketer-office/network?root=${root}&depth=${depth}`,refresh);
  return <section className="portal-card office-network">
    <header><h2>اعضای شبکه</h2><label>عمق نمایش <select value={depth} onChange={e=>setDepth(Number(e.target.value))}>{Array.from({length:maxDepth},(_,i)=>i+1).map(d=><option key={d} value={d}>{d.toLocaleString("fa-IR")} سطح</option>)}</select></label></header>
    <DataState state={state}>{d=><>
      <nav aria-label="مسیر زیرمجموعه" className="office-path">{d.path.map((p:RecordData)=><button key={p.id} onClick={()=>setRoot(p.id)}>{p.name}</button>)}{root!==userId&&<button onClick={()=>setRoot(userId)}>بازگشت به شبکه من</button>}</nav>
      <div className="office-members">{d.rows.map((m:RecordData)=><button key={m.id} onClick={()=>setRoot(m.id)} className="office-member"><span><b>{m.name}</b><small>عمق {Number(m.depth).toLocaleString("fa-IR")} · <span dir="ltr">{m.referral_code}</span></small></span><span><small>خرید تأییدشده</small><b>{amount(m.personalVolume)}</b></span></button>)}</div>
      {d.truncated&&<p role="status">۲۰۰ عضو نمایش داده شد؛ برای دیدن ادامه، زیرمجموعه یکی از اعضا را باز کنید.</p>}
    </>}</DataState>
  </section>;
}
export function OfficeAccessEditor({userId,onChange}:{userId:string;onChange:()=>void}) {
  const [tick,setTick]=useState(0),[level,setLevel]=useState<number|null>(null),[reason,setReason]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const state=useData(`admin/marketer-office?userId=${userId}`,tick);
  return <section className="portal-card office-access"><h3>دسترسی دفتر کار بازاریاب</h3><p>این مجوز مستقل از رتبه مالی است؛ فقط مدیر اصلی می‌تواند آن را فعال یا لغو کند.</p><DataState state={state}>{d=><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");setNotice("");try{await api("admin/marketer-office","PATCH",{userId,level:level??d.level,reason});setTick(t=>t+1);onChange();setNotice("دسترسی ذخیره شد");}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}>
    <label>سطح دسترسی<select value={level??d.level} onChange={e=>setLevel(Number(e.target.value))}><option value={0}>غیرفعال</option>{[1,2,3,4,5,6,7].map(l=><option key={l} value={l}>سطح {l} — نمایش تا عمق {l+5}</option>)}</select></label>
    <label>دلیل تغییر<input value={reason} onChange={e=>setReason(e.target.value)} required maxLength={200}/></label>
    <button className="portal-button" disabled={busy||!reason.trim()}>ذخیره دسترسی</button>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </form>}</DataState></section>;
}
