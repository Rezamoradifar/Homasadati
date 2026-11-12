import {randomUUID} from "node:crypto";
import {all,run,now,type Row} from "./schema";
import {ApiError} from "../server/http";
import {TRAVEL_CARD_MAX_QUANTITY} from "./travel-card-product";

/** Physical, paid cards are separate from rank-awarded travel benefits.
 * Issuance does not book a trip or reserve tour seats. */
export function issuePurchasedTravelCards(order:Row) {
  let terms:Record<string,unknown>={};
  try{const p=JSON.parse(order.policy);if(p?.orderTerms&&typeof p.orderTerms==="object")terms=p.orderTerms;}catch{return}
  if(terms.cardKind!=="travel_card"||!order.paid_at||!["processing","shipped","delivered"].includes(String(order.status)))return;
  if(!Number.isSafeInteger(order.quantity)||order.quantity<1||order.quantity>TRAVEL_CARD_MAX_QUANTITY)throw new ApiError(409,"invalid_card_quantity");
  for(let i=1;i<=order.quantity;i++){
    const id=randomUUID();
    const number="HNT-"+id.replaceAll("-","").toUpperCase();
    run("INSERT OR IGNORE INTO p_purchased_travel_cards(id,order_id,user_id,sequence,card_number,face_value_toman,issued_at,voided_at) VALUES(?,?,?,?,?,?,?,NULL)",
      id,order.id,order.user_id,i,number,order.unit_price,order.paid_at||now());
  }
}
export function revokePurchasedTravelCards(orderId:string) {
  run("UPDATE p_purchased_travel_cards SET voided_at=COALESCE(voided_at,?) WHERE order_id=? AND voided_at IS NULL",now(),orderId);
}
export function purchasedTravelCards(userId:string) {
  return all(`SELECT c.card_number,c.face_value_toman,c.issued_at,c.voided_at,o.id order_id,o.title,o.status order_status
    FROM p_purchased_travel_cards c JOIN p_orders o ON o.id=c.order_id
    WHERE c.user_id=? AND o.user_id=? ORDER BY c.issued_at DESC,c.sequence LIMIT 200`,userId,userId);
}
