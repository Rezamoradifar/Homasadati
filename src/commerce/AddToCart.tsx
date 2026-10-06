"use client";
import Localized from "../i18n/Localized";
import { useState } from "react";
import { CheckCircle, ShoppingBag } from "@phosphor-icons/react";
import QuantitySelector from "./QuantitySelector";
import { addToBasket } from "./basket";
export default function AddToCart({id,stock}:{id:string;stock:number}){
  const [quantity,setQuantity]=useState(1),[notice,setNotice]=useState(""),[added,setAdded]=useState(false);
  return <Localized><form className="add-cart-form" onSubmit={e=>{e.preventDefault();try{addToBasket(id,quantity,stock);setNotice("به سبد خرید اضافه شد.");setAdded(true);}catch(e){setAdded(false);setNotice(e instanceof Error?e.message:"ذخیره سبد در مرورگر ممکن نشد.");}}}>
    <div className="store-cta"><QuantitySelector value={quantity} max={Math.min(stock,100)} disabled={stock===0} onChange={n=>{setQuantity(n);setNotice("");}}/><button className="commerce-button" disabled={stock===0}><ShoppingBag size={20}/>{stock?"افزودن به سبد خرید":"ناموجود"}</button></div>
    {notice&&<div className={"add-cart-feedback "+(added?"added":"error")} role={added?"status":"alert"}>{added&&<CheckCircle size={22}/>}<span>{notice}</span>{added&&<a href="/cart">مشاهده سبد و ادامه خرید</a>}</div>}
  </form></Localized>;
}
