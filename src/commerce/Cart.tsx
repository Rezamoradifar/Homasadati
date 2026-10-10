"use client";

import {PurchaseActivationReceipt} from "../platform/PurchaseActivationReceipt";
import { Money, UsdNote } from "./currency";
import {useSiteLocale} from "../i18n/SiteLocale";
import {catalogCopy} from "../i18n/catalog";
import Localized from "../i18n/Localized";
import { useEffect, useState, useRef } from "react";
import { api, amount, RecordData } from "../platform/client";
import { ShoppingBag, Trash, ShieldCheck, ArrowLeft, ArrowRight, CheckCircle, MapPin, CreditCard, Wallet, Clock } from "@phosphor-icons/react";
import { Form } from "../platform/Widgets";
import QuantitySelector from "./QuantitySelector";
import { useBasket, writeBasket } from "./basket";
export default function Cart() {
  const {locale}=useSiteLocale();
  const { items, ready } = useBasket(),
    [quote, setQuote] = useState<RecordData | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [me, setMe] = useState<RecordData | null>(null),
    [addresses, setAddresses] = useState<RecordData[]>([]),
    [address, setAddress] = useState(""),
    [method, setMethod] = useState("zibal"),
    [methods,setMethods] = useState<RecordData>({}),
    [methodsReady,setMethodsReady]=useState(false),
    [step,setStep]=useState(0),
    [quoteVersion,setQuoteVersion]=useState(""),
    [receipt,setReceipt]=useState<RecordData|null>(null),
    [clubLive,setClubLive]=useState(false),
    [newAddress,setNewAddress]=useState(false),
    [stage, setStage] = useState<"" | "redirecting">(""),
    [voucher, setVoucher] = useState(0),
    [useVoucher, setUseVoucher] = useState(false),
    [pending, setPending] = useState(""),
    [done, setDone] = useState(false),
    [revision, setRevision] = useState(0);
  const version = JSON.stringify(items),
    lock = useRef(false);
  useEffect(() => {
    api("payment/methods")
      .then((m) => {setMethods(m);setMethod(m.zibal?"zibal":m.zarinpal?"zarinpal":m.bale?"bale":"wallet");setMethodsReady(true);})
      .catch(() => {setMethods({});setMethodsReady(false);});
  }, [revision]);
  useEffect(() => {
    api("me")
      .then((r) => {
        setMe(r.user);
        return api("addresses");
      })
      .then((r) => {
        setAddresses(r.rows);
        return api("seven-card-plan")
          .then((plan) => {setVoucher(Math.max(0, Number(plan.member?.voucherBalance) || 0));setClubLive(!!plan.liveSettlement);})
          .catch(() => setVoucher(0));
      })
      .catch((e) => {
        if (e.message !== "برای ادامه وارد حساب شوید.") setError(e.message);
      });
    try {
      setPending(sessionStorage.getItem("homa-pending-checkout") || "");
    } catch {}
  }, []);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    setQuote(null);
    if (!items.length) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    api("cart/quote", "POST", { items })
      .then((r) => {
        if (live) {setQuote(r);setQuoteVersion(version);}
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [version, ready, revision]);
  const edit = (id: string, quantity: number) => {
    setStep(0);
    try {
      writeBasket(
        quantity
          ? items.map((x) => (x.productId === id ? { ...x, quantity } : x))
          : items.filter((x) => x.productId !== id),
      );
    } catch {
      setError("ذخیره سبد در مرورگر ممکن نشد.");
    }
  };
  const pay = async (id: string) => {
    const state = await api(`checkouts/${id}`);
    if (state.status === "paid") {
      setReceipt({...state,id});
      setDone(true);
      setPending("");
      try {sessionStorage.removeItem("homa-pending-checkout");} catch {}
      return;
    }
    const result = await api(`checkouts/${id}/payment`, "POST", {});
    if (result.status === "paid") {
      setReceipt({...await api(`checkouts/${id}`),id});
      setDone(true);
      setPending("");
      try {sessionStorage.removeItem("homa-pending-checkout");} catch {}
      return;
    }
    setStage("redirecting");
    window.location.assign(result.url);
  };
  const checkout = async () => {
    if (lock.current || !quote || quoteVersion !== version || !methodsReady) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = {
        items,
        method,
        expectedTotal: quote.total,
        ...(useVoucher && voucher > 0 ? { useVoucher: true } : {}),
        ...(quote.requiresAddress ? { addressId: address } : {}),
      };
      const signature = JSON.stringify(payload);
      let saved;
      try {
        saved = JSON.parse(
          sessionStorage.getItem("homa-checkout-key") || "null",
        );
      } catch {}
      const idempotencyKey =
        saved?.signature === signature ? saved.key : crypto.randomUUID();
      try {sessionStorage.setItem("homa-checkout-key",JSON.stringify({signature,key:idempotencyKey}));} catch {throw new Error("ذخیره سبد در مرورگر ممکن نشد.");}
      const c = await api("checkouts", "POST", { ...payload, idempotencyKey });
      setPending(c.id);
      try {sessionStorage.setItem("homa-pending-checkout",c.id);sessionStorage.removeItem("homa-checkout-key");} catch {}
      writeBasket([]);
      await pay(c.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const validQuote=!!quote && quoteVersion===version && !loading;
  const due=quote?Math.max(0,quote.total-(useVoucher?voucher:0))+quote.shippingFeeToman:0;
  const itemCount=items.reduce((n,item)=>n+item.quantity,0);
  const selectedAddress=addresses.find(a=>a.id===address);
  const methodNames:Record<string,string>={zibal:"زیبال",zarinpal:"زرین‌پال",bale:"پرداخت با بله",wallet:"کیف پول",company_credit:"اعتبار خرید شرکت"};
  const next=()=>{setStep(n=>Math.min(2,n+1));setError("");document.getElementById("checkout-heading")?.focus();};
  return <Localized><div className="shop-wrap checkout-page" data-checkout-version="2026-10-06">
    <header className="checkout-heading"><div><span className="commerce-eyebrow">خرید از خانوادهٔ همای</span><h1 id="checkout-heading" tabIndex={-1}>{done?"سفارش شما ثبت شد":"سبد خرید و پرداخت"}</h1><p>انتخاب شما، با جزئیات روشن و پرداخت امن.</p></div><a href="/shop">ادامه خرید<ArrowLeft size={18}/></a></header>
    <ol className="checkout-steps" aria-label="مراحل خرید">{["سبد خرید","اطلاعات خرید","تأیید و پرداخت"].map((title,i)=><li key={title} aria-current={step===i?"step":undefined} className={step===i?"current":step>i?"complete":""}><span>{step>i?<CheckCircle size={21}/>:amount(i+1)}</span><strong>{title}</strong></li>)}</ol>
    {error&&<div className="shop-error" role="alert"><p>{error}</p><button type="button" className="commerce-button outline" onClick={()=>{setRevision(x=>x+1);setStep(0);}}>بررسی دوباره</button></div>}
    {done&&<section className="checkout-success" role="status"><CheckCircle size={52} weight="duotone"/><h2>پرداخت ثبت شد</h2><p>می‌توانید سفارش و وضعیت خریدتان را در حساب پیگیری کنید.</p>{receipt&&<dl><dt>شماره سفارش</dt><dd dir="ltr" translate="no">{receipt.id}</dd>{receipt.amount&&<><dt>مبلغ پرداخت</dt><dd><Money toman={receipt.amount}/></dd></>}</dl>}<PurchaseActivationReceipt receipt={receipt?.activationReceipt}/><a href="/account?tab=orders" className="commerce-button">مشاهده سفارش‌ها</a><a href="/account?tab=seven-card-plan" className="commerce-button outline">وضعیت کارت و حجم خرید</a></section>}
    {pending&&!done&&<section className="shop-notice checkout-pending"><ClockIcon/><div><h2>پرداخت ناتمام</h2><p>سفارش ثبت شده است؛ پرداخت آن را ادامه دهید یا نتیجه را بررسی کنید.</p><button className="commerce-button" disabled={busy||!me} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError("");try{await pay(pending);}catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}}}>{busy?"در حال بررسی…":"ادامه / بررسی پرداخت"}</button><a href="/account?tab=orders">پیگیری سفارش‌ها</a></div></section>}
    {(!ready||loading)&&<div className="checkout-loading" role="status">در حال بررسی قیمت و موجودی…</div>}
    {ready&&!items.length&&!loading&&!pending&&!done&&<section className="checkout-empty"><ShoppingBag size={60} weight="duotone"/><h2>سبد خرید خالی است.</h2><p>از میان محصولات و تجربه‌های همای انتخاب کنید.</p><a href="/shop" className="commerce-button">انتخاب از فروشگاه<ArrowLeft size={18}/></a></section>}
    {items.length>0&&!done&&<div className="cart-layout checkout-layout"><div className="checkout-content">
      {step===0&&<section className="checkout-section" aria-label="اقلام سبد"><div className="checkout-section-title"><h2>انتخاب‌های شما</h2><span>{amount(itemCount)} کالا</span></div>{items.map((item,i)=>{const p=quote?.rows.find((r:RecordData)=>r.id===item.productId);let img=null;try{img=p?JSON.parse(p.images)[0]:null;}catch{}const title=p?catalogCopy({title:p.title,details:p.details},locale).title:undefined;return <Localized key={item.productId}><article className="cart-row checkout-item">{img?<img src={img} alt=""/>:<img src="/assets/brand/homanet-mark-orange.png" alt="" className="checkout-product-mark"/>}<div className="checkout-item-info"><a href={`/shop/${item.productId}`}><h3>{title||`مشاهده مشخصات کالای ${i+1}`}</h3></a><p>{p?<Money toman={p.price}/>:"قیمت نیازمند بررسی است"}</p>{p&&<p>موجودی قابل سفارش: {amount(p.stock)}</p>}<button type="button" className="cart-remove" disabled={busy} onClick={()=>edit(item.productId,0)}><Trash size={16}/>حذف از سبد</button></div><div className="checkout-item-quantity"><QuantitySelector label={`تعداد ${title||i+1}`} value={item.quantity} max={Math.min(p?.stock??100,100)} disabled={busy||loading} onChange={n=>edit(item.productId,n)}/>{p&&<strong><Money toman={p.lineTotal}/></strong>}</div></article></Localized>;})}<a className="checkout-continue" href="/shop"><ArrowRight size={18}/>افزودن محصولات دیگر</a></section>}
      {step===1&&<section className="checkout-section"><h2>اطلاعات خرید</h2>{quote?.requiresAddress&&<div className="checkout-delivery"><h3><MapPin size={22}/>آدرس ارسال</h3><label>آدرس ارسال<select required disabled={busy} value={address} onChange={e=>setAddress(e.target.value)}><option value="">آدرس را انتخاب کنید</option>{addresses.map(a=><option key={a.id} translate="no" value={a.id}>{a.label} — {a.city} — {a.address}</option>)}</select></label>{selectedAddress&&<p className="checkout-address" translate="no">{selectedAddress.country}، {selectedAddress.city}، {selectedAddress.address}<br/>{selectedAddress.postal_code}</p>}<button type="button" className="checkout-new-address" onClick={()=>setNewAddress(!newAddress)}>ثبت آدرس جدید</button><a href="/account?tab=addresses">ثبت / ویرایش آدرس</a>{newAddress&&<div className="checkout-address-form"><Form fields={[{name:"label",label:"عنوان آدرس"},{name:"country",label:"کشور"},{name:"city",label:"شهر"},{name:"postal_code",label:"کد پستی"},{name:"address",label:"آدرس کامل",type:"textarea"}]} initial={{label:"خانه",country:"ایران"}} submit="ذخیره آدرس" onSubmit={async values=>{const saved=await api("addresses","POST",values);const list=await api("addresses");setAddresses(list.rows);setAddress(saved.id);setNewAddress(false);}}/></div>}</div>}<div className="checkout-payment"><h3><CreditCard size={22}/>روش پرداخت</h3><label className="checkout-method-select">روش پرداخت<select value={method} disabled={busy||!methodsReady} onChange={e=>{setMethod(e.target.value);if(e.target.value==="company_credit")setUseVoucher(false);}}>{Object.entries(methodNames).filter(([key])=>methods[key]).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><div className="checkout-methods">{Object.entries(methodNames).filter(([key])=>methods[key]).map(([key,label])=><button type="button" key={key} className={method===key?"selected":""} aria-pressed={method===key} onClick={()=>{setMethod(key);if(key==="company_credit")setUseVoucher(false);}}>{key==="wallet"?<Wallet size={24}/>:<CreditCard size={24}/>}<strong>{label}</strong><span>{key==="company_credit"?"فقط خرید؛ بدون برداشت و پورسانت":key==="wallet"?"از موجودی قابل استفاده":"انتقال به صفحه پرداخت"}</span></button>)}</div>{!methodsReady&&<p role="status">روش‌های پرداخت دریافت نشد؛ دوباره بررسی کنید.</p>}</div>{method!=="company_credit"&&voucher>0&&<label className="cart-voucher"><input type="checkbox" disabled={busy} checked={useVoucher} onChange={e=>setUseVoucher(e.target.checked)}/>استفاده از موجودی ووچر خرید: <Money toman={voucher}/></label>}</section>}
      {step===2&&<section className="checkout-section checkout-review"><h2>بررسی نهایی سفارش</h2><p>پیش از پرداخت، انتخاب‌ها و اطلاعات سفارش را مرور کنید.</p><dl><dt>روش پرداخت</dt><dd>{methodNames[method]}</dd>{selectedAddress&&<><dt>آدرس ارسال</dt><dd translate="no">{selectedAddress.city}، {selectedAddress.address}</dd></>}<dt>تعداد کالا</dt><dd>{amount(itemCount)}</dd></dl>{quote?.rows.map((p:RecordData)=><div key={p.id} className="checkout-review-row"><span>{catalogCopy({title:p.title,details:p.details},locale).title}<small>تعداد: {amount(p.quantity)}</small></span><strong><Money toman={p.lineTotal}/></strong></div>)}<p className="checkout-policy">با ثبت سفارش، <a href="/legal/terms" target="_blank" rel="noopener noreferrer">شرایط خرید و لغو</a> را می‌پذیرید. قیمت و موجودی پیش از ثبت دوباره بررسی می‌شوند.</p></section>}
    </div><aside className="cart-summary checkout-summary"><div className="checkout-summary-title"><h2>خلاصه سفارش</h2><ShoppingBag size={24}/></div><dl><div><dt>مبلغ کالاها</dt><dd>{validQuote?<Money toman={quote!.total}/>:"در انتظار بررسی"}</dd></div><div><dt>هزینه اضافه ارسال</dt><dd>{validQuote?<Money toman={quote!.shippingFeeToman}/>:"در انتظار بررسی"}</dd></div>{useVoucher&&voucher>0&&quote&&<div><dt>کسر ووچر خرید</dt><dd><Money toman={Math.min(voucher,quote.total)}/></dd></div>}</dl><div className="checkout-payable"><span>مبلغ قابل پرداخت</span><strong>{validQuote?<Money toman={due}/>:"در انتظار بررسی"}</strong><UsdNote/></div>{me?<><button className="commerce-button checkout-pay" disabled={busy||!validQuote||(step>0&&(!methodsReady||!methods[method]||(quote?.requiresAddress&&!address)))} onClick={step===2?checkout:next}>{busy?(stage==="redirecting"?"در حال انتقال به پرداخت…":"در حال ثبت…"):step===2?"ثبت سفارش و پرداخت":step===0?"ادامه و اطلاعات خرید":"بررسی نهایی سفارش"}<ArrowLeft size={18}/></button>{step>0&&<button type="button" className="checkout-back" disabled={busy} onClick={()=>setStep(n=>n-1)}><ArrowRight size={17}/>بازگشت به مرحله قبل</button>}</>:<><p>برای پرداخت وارد حساب شوید؛ سبد شما در همین مرورگر باقی می‌ماند.</p><a className="commerce-button checkout-pay" href="/account">ورود / ثبت‌نام</a></>}<p className="checkout-secure"><ShieldCheck size={21}/>بررسی قیمت، موجودی و تأیید پرداخت</p><p className="checkout-reservation">سفارش پرداخت‌نشده تا یک ساعت رزرو می‌ماند.</p></aside>
    <section className="checkout-volume"><CheckCircle size={26}/><div><h3>این خرید در حجم باشگاه شما</h3>{method==="company_credit"?<p>خرید با اعتبار شرکت، شرط خرید واقعی، فعال‌سازی جایگاه و حجم پورسانت را تکمیل نمی‌کند.</p>:clubLive?<p>خرید پرداخت‌شده پس از پایان مهلت لغو، طبق زمان‌بندی پلن در حجم خرید شما محاسبه می‌شود. از خرید خودتان پورسانت دریافت نمی‌کنید.</p>:<p>خرید در سوابق حساب ثبت می‌شود. محاسبهٔ جایگاه‌ها و پورسانت این پلن به فعال بودن تسویهٔ باشگاه بستگی دارد.</p>}</div></section></div>}
  </div></Localized>;
}
function ClockIcon(){return <Clock size={28}/>;}
