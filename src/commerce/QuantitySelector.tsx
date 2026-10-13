"use client";
import { Minus, Plus } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import Localized from "../i18n/Localized";
export default function QuantitySelector({value,max=100,disabled=false,label="تعداد خرید",onChange}:{value:number;max?:number;disabled?:boolean;label?:string;onChange:(n:number)=>void}){
  const [draft,setDraft]=useState(String(value));
  useEffect(()=>{setDraft(String(value));},[value,max,disabled]);
  const change=(n:number)=>{setDraft(String(n));onChange(n);};
  return <Localized><div className="quantity-selector"><button type="button" aria-label="کاهش تعداد" disabled={disabled||value<=1} onClick={()=>change(value-1)}><Minus size={16}/></button><input aria-label={label} type="number" inputMode="numeric" step={1} min={1} max={Math.max(1,max)} required disabled={disabled} value={draft} onBlur={()=>setDraft(String(value))} onChange={e=>{const raw=e.target.value;setDraft(raw);const n=Number(raw);if(raw!==""&&Number.isInteger(n)&&n>=1&&n<=max)onChange(n);}}/><button type="button" aria-label="افزایش تعداد" disabled={disabled||value>=max} onClick={()=>change(value+1)}><Plus size={16}/></button></div></Localized>;
}
