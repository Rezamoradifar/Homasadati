"use client";
import { Minus, Plus } from "@phosphor-icons/react";
import Localized from "../i18n/Localized";
export default function QuantitySelector({value,max=100,disabled=false,label="تعداد خرید",onChange}:{value:number;max?:number;disabled?:boolean;label?:string;onChange:(n:number)=>void}){
  return <Localized><div className="quantity-selector"><button type="button" aria-label="کاهش تعداد" disabled={disabled||value<=1} onClick={()=>onChange(value-1)}><Minus size={16}/></button><input aria-label={label} type="number" min={1} max={Math.max(1,max)} required disabled={disabled} value={value} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=1&&n<=max)onChange(n);}}/><button type="button" aria-label="افزایش تعداد" disabled={disabled||value>=max} onClick={()=>onChange(value+1)}><Plus size={16}/></button></div></Localized>;
}
