"use client";
import { useEffect } from "react";
import { experiencePage, type ExperienceEvent } from "./experience-model";

/** Small first-load/error batches; never collects raw errors, URLs, identifiers or form contents. */
export default function SiteExperience() {
  useEffect(()=>{
    let queue:ExperienceEvent[]=[], count=0, timer:ReturnType<typeof setTimeout>|undefined, lcp=0;
    const flush=()=>{
      if(timer)clearTimeout(timer);
      timer=undefined;
      if(!queue.length)return;
      const events=queue;queue=[];
      void fetch("/api/experience",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({events}),keepalive:true,credentials:"same-origin"}).catch(()=>{});
    };
    const add=(kind:ExperienceEvent["kind"],duration=0)=>{
      if(count>=12)return;
      count++;
      queue.push({page:experiencePage(location.pathname),kind,duration:Math.min(120000,Math.max(0,Math.round(duration)||0))});
      if(!timer)timer=setTimeout(flush,2000);
    };
    const navigation=()=>{
      const n=performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming|undefined;
      if(n){add("navigation",n.loadEventEnd || performance.now());add("ttfb",n.responseStart-n.startTime);}
    };
    if(document.readyState==="complete")navigation();else window.addEventListener("load",navigation,{once:true});
    let observer:PerformanceObserver|undefined;
    try {
      observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())lcp=entry.startTime;});
      observer.observe({type:"largest-contentful-paint",buffered:true});
    } catch {}
    const finalize=()=>{if(lcp){add("lcp",lcp);lcp=0;}observer?.disconnect();flush();};
    const visibility=()=>{if(document.visibilityState==="hidden")finalize();};
    const apiError=(e:Event)=>{
      const d=(e as CustomEvent<{kind:ExperienceEvent["kind"];duration:number}>).detail;
      if(d && ["api_slow","api_network","api_timeout","api_server","api_invalid","runtime"].includes(d.kind))add(d.kind,d.duration);
    };
    const error=(e:Event)=>add(e.target && e.target!==window?"resource":"runtime");
    const rejection=()=>add("runtime");
    window.addEventListener("platform-diagnostic",apiError);
    window.addEventListener("error",error,true);
    window.addEventListener("unhandledrejection",rejection);
    window.addEventListener("pagehide",finalize);
    document.addEventListener("visibilitychange",visibility);
    return ()=>{
      if(timer)clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("load",navigation);
      window.removeEventListener("platform-diagnostic",apiError);
      window.removeEventListener("error",error,true);
      window.removeEventListener("unhandledrejection",rejection);
      window.removeEventListener("pagehide",finalize);
      document.removeEventListener("visibilitychange",visibility);
    };
  },[]);
  return null;
}
