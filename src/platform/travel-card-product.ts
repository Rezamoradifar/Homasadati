/** Made-to-order travel cards are not dated tour inventory. */
export type TravelCardItem = {vertical?:unknown;subtype?:unknown;title?:unknown;details?:unknown};
export const TRAVEL_CARD_MAX_QUANTITY=10;
export function isTravelCardProduct(p:TravelCardItem):boolean {
  if(p.vertical!=="tourism")return false;
  const subtype=typeof p.subtype==="string"?p.subtype.trim().toLowerCase():"";
  const title=typeof p.title==="string"?p.title.trim().toLowerCase():"";
  const labels=new Set(["travel_card","tourism_card","travel card","tourism card","کارت","کارت سفر","کارت گردشگری","کارت مسافرتی"]);
  if(labels.has(subtype))return true;
  if(/^کارت[\s‌-]+(?:گردشگری|سفر|مسافرتی|جوانه|سرو|فیروزه|یاقوت|زمرد|الماس|سیمرغ|آریا|پارسه)(?:\s|$)/u.test(title))return true;
  let details:unknown=p.details;
  if(typeof details==="string"){try{details=JSON.parse(details)}catch{details=undefined}}
  return !!(details&&typeof details==="object"&&!Array.isArray(details) &&
    ((details as Record<string,unknown>).productMode==="travel_card"||(details as Record<string,unknown>).travelCard===true));
}
