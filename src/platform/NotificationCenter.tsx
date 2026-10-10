"use client";
import {useState} from 'react';
import Localized from '../i18n/Localized';
import {api,date,RecordData} from './client';
import {DataState,Pagination,useData} from './Widgets';
import {messagePresentation} from './message-presentation';
export function NotificationCenter({refresh,onChange}:{refresh:number;onChange:()=>void}) {
  const [page,setPage]=useState(1),[updated,setUpdated]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const state=useData('notifications?page='+page,refresh+updated);
  const mark=async(id?:string)=>{
    if(busy)return;setBusy(true);setError('');
    try{await api('notifications','PATCH',id?{id}:{all:true});setUpdated(v=>v+1);onChange();}
    catch(e){setError(e instanceof Error?e.message:'عملیات انجام نشد.');}
    finally{setBusy(false);}
  };
  return <Localized><section className="notification-center"><header><div><span className="notification-eyebrow">هما نت · باشگاه مشتریان</span><h2>پیام‌های من</h2><p>خرید، پشتیبانی و فعالیت حساب را از اینجا پیگیری کنید.</p></div><button className="portal-button secondary" disabled={busy} onClick={()=>mark()}>همه خوانده شدند</button></header>{error&&<p className="portal-error" role="alert">{error}</p>}<DataState state={state}>{d=><>{d.rows.length===0?<p className="portal-empty">هنوز پیامی دریافت نکرده‌اید.</p>:<ul className="notification-cards">{d.rows.map((row:RecordData)=>{const m=messagePresentation(row.title,row.body);return <li key={row.id}><article className={'notification-message '+(row.read_at?'read':'unread')}><div className="notification-meta"><span>{m.group}</span><span>{row.read_at?'خوانده‌شده':'جدید'}</span><time dateTime={row.created_at}>{date(row.created_at)}</time></div><h3>{row.title}</h3><p>{m.text}</p><div className="notification-actions"><a className="portal-button secondary" href={'/account?tab='+m.tab}>{m.action}</a>{!row.read_at&&<button className="portal-button" disabled={busy} onClick={()=>mark(row.id)}>خواندم</button>}</div></article></li>;})}</ul>}<Pagination page={page} more={d.hasMore} onChange={setPage}/></>}</DataState></section></Localized>;
}
