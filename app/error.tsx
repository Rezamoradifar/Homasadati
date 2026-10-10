"use client";
import {useEffect} from "react";
import Localized from "../src/i18n/Localized";
export default function ErrorPage({reset}:{error:Error & {digest?:string};reset:()=>void}) {
  useEffect(()=>{window.dispatchEvent(new CustomEvent("platform-diagnostic",{detail:{kind:"runtime",duration:0}}));},[]);
  return <Localized><main className="site-error" dir="rtl"><h1>صفحه موقتاً در دسترس نیست</h1><p>دریافت صفحه انجام نشد. دوباره تلاش کنید یا به صفحه اصلی برگردید.</p><div><button type="button" onClick={reset}>تلاش دوباره</button><a href="/">صفحه اصلی</a><a href="/account?tab=tickets">پشتیبانی</a></div></main></Localized>;
}
