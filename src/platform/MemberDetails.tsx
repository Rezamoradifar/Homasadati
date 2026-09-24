'use client';

import { useSiteLocale } from "../i18n/SiteLocale";
import Localized from "../i18n/Localized";
import {useState} from 'react';
import {Form,useData,DataState,Notice} from './Widgets';
import {api,date,RecordData} from './client';
export function MemberDetails({onChange}:{onChange:()=>Promise<void>}){
  const { locale } = useSiteLocale();
const[n,setN]=useState(0),[message,setMessage]=useState(''),state=useData('member-details',n);return <Localized><section className="portal-card"><h2>مشخصات تکمیلی و پذیرش قوانین</h2><Notice success={message}/><DataState state={state}>{d=>{const info=d.profile?JSON.parse(d.profile.details):{};return <Localized><><p>{d.profile?.contact_verified_at?'راه تماس در زمان ثبت‌نام با کد یک‌بارمصرف تأیید شده است.':'برای این حساب سابقه تأیید راه تماس در فرم جدید ثبت نشده است.'} احراز رسمی مدارک انجام نشده است.</p><p>{d.consent?'نسخه قوانین پذیرفته‌شده: '+d.consent.version+' · '+date(d.consent.accepted_at, locale):'برای این حساب قدیمی، پذیرش نسخه جدید ثبت نشده است.'}</p><Form submit="ذخیره مشخصات تکمیلی" key={n} initial={info} fields={[{name:'firstName',label:'نام'},{name:'lastName',label:'نام خانوادگی'},{name:'country',label:'کشور'},{name:'city',label:'شهر'},{name:'occupation',label:'زمینه فعالیت',required:false},{name:'language',label:'زبان ترجیحی',type:'select',options:[['fa','فارسی'],['en','English'],['ar','العربية']]},{name:'interests',label:'علاقه‌مندی‌ها',type:'multiselect',required:false,options:[['tourism','گردشگری'],['craft','صنایع‌دستی'],['beauty','زیبایی'],['ai','هوش مصنوعی'],['leather','چرم']]}]} onSubmit={async(v:RecordData)=>{await api('member-details','PATCH',v);setMessage('مشخصات تکمیلی ذخیره شد.');setN(n=>n+1);await onChange();}}/></></Localized>}}</DataState></section></Localized>}
