import {all,one} from "./schema";
import {positionMode} from "./card-positions";
import {memberCardStatus} from "./seven-card-engine";
/** Read-only per-account report. Volume pools for different positions must never be added as unique sales. */
export function cardActivityReport(user:string,page:number) {
  if(!positionMode())return null;
  const status=memberCardStatus(user);
  const pools=all("SELECT desk,leg,SUM(volume) total,SUM(remaining) remaining,SUM(volume-remaining) consumed FROM p_card_position_lots WHERE user_id=? AND void=0 GROUP BY desk,leg",user);
  const positions=status.slots.map(slot=>({desk:slot.desk,active:slot.active,left:pools.find(p=>p.desk===slot.desk&&p.leg==='left')||{total:0,remaining:0,consumed:0},right:pools.find(p=>p.desk===slot.desk&&p.leg==='right')||{total:0,remaining:0,consumed:0}}));
  const summary=one(`SELECT COALESCE(SUM(CASE WHEN d.status='pending' AND m.void=0 AND d.kind='cash' THEN d.amount ELSE 0 END),0) pendingCash,
    COALESCE(SUM(CASE WHEN d.status='pending' AND m.void=0 AND d.kind='voucher' THEN d.amount ELSE 0 END),0) pendingVoucher,
    MIN(CASE WHEN d.status='pending' AND m.void=0 THEN d.release_at END) nextRelease
    FROM p_card_due d JOIN p_card_matches m ON m.id=d.match_id WHERE d.user_id=?`,user)!;
  const matches=all(`SELECT m.id,m.week,m.desk,m.kind,m.amount gross,m.void,COALESCE(d.amount,p.amount,0) amount,
    COALESCE(d.status,CASE WHEN p.id IS NOT NULL THEN 'released' ELSE 'flushed' END) status,d.release_at,
    COALESCE(f.amount,0) flushed FROM p_card_matches m LEFT JOIN p_card_due d ON d.match_id=m.id
    LEFT JOIN p_card_payouts p ON p.match_id=m.id LEFT JOIN p_card_flush f ON f.match_id=m.id
    WHERE m.user_id=? ORDER BY m.created_at DESC,m.id DESC LIMIT 31 OFFSET ?`,user,(page-1)*30);
  return {positions,summary,weeklyCap:status.weeklyCapToman,voucherBalance:status.voucherBalance,live:status.live,matches:matches.slice(0,30),hasMore:matches.length>30};
}
