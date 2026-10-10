import {operationsHealth} from "./operations-health";
import {companyPositionStatus} from "./company-members";
import {setting} from "./providers";
import {desksForPurchase} from "./card-levels";
import {all,one} from "./schema";
/** Counts only. Tehran local day, no customer data or financial credentials. */
export function launchDashboard(at=Date.now()) {
  const day=86400000,shift=12600000;
  const today=new Date(Math.floor((at+shift)/day)*day-shift).toISOString();
  const week=new Date(at-7*day).toISOString();
  const count=(sql:string,...args:any[])=>one(sql,...args)!.n as number;
  const backlog=(table:string,where:string,column='created_at')=>one(`SELECT COUNT(*) count,MIN(${column}) oldest FROM ${table} WHERE ${where}`)!;
  const health=operationsHealth(at);
  // Mirror positionPurchaseTotal: confirmed purchases light positions before weekly settlement.
  const paid=new Map<string,number>(all(`SELECT o.user_id,SUM(o.amount) total FROM p_orders o JOIN p_users u ON u.id=o.user_id
    WHERE u.blocked=0 AND o.paid_at IS NOT NULL AND o.paid_at>=? AND o.paid_at<=? AND o.refunded_at IS NULL
    AND o.status NOT IN ('cancelled','refunded') AND o.payment_method!='company_credit'
    AND NOT EXISTS(SELECT 1 FROM p_archived_users a WHERE a.user_id=u.id) GROUP BY o.user_id`,
    new Date(Number(setting('seven_card_live_since')||0)).toISOString(),new Date(at).toISOString()).map(r=>[r.user_id,desksForPurchase(r.total)]));
  let activePositions=[...paid.values()].reduce((sum,n)=>sum+n,0);
  for(const grant of all('SELECT g.user_id FROM p_company_positions g JOIN p_users u ON u.id=g.user_id WHERE u.blocked=0 AND NOT EXISTS(SELECT 1 FROM p_archived_users a WHERE a.user_id=u.id)'))
    activePositions+=Math.max(0,(companyPositionStatus(grant.user_id,at)?.activeDesks||0)-(paid.get(grant.user_id)||0));
  return {since:today,weekSince:week,generatedAt:new Date(at).toISOString(),health,activePositions,
    latestSettlement:one('SELECT week,settled_at,matches,cash,voucher FROM p_card_weeks ORDER BY week DESC LIMIT 1')||null,
    rewardRelease:one("SELECT COUNT(*) count,COALESCE(SUM(d.amount),0) amount,MIN(d.release_at) oldest FROM p_card_due d JOIN p_card_matches m ON m.id=d.match_id JOIN p_users u ON u.id=d.user_id WHERE d.status='pending' AND d.release_at<=? AND m.void=0 AND u.blocked=0",new Date(at).toISOString()),
    registrationsToday:count('SELECT COUNT(*) n FROM p_users WHERE created_at>=?',today),
    registrationsWeek:count('SELECT COUNT(*) n FROM p_users WHERE created_at>=?',week),
    paidOrdersToday:count("SELECT COUNT(*) n FROM p_orders WHERE paid_at>=? AND refunded_at IS NULL AND status NOT IN ('cancelled','refunded')",today),
    pendingPayments:backlog('p_orders',"status='pending' AND paid_at IS NULL"),
    bankReviews:backlog('p_payout_profiles',"status='pending'",'updated_at'),
    support:backlog('p_tickets',"status='waiting_support'",'updated_at'),
    withdrawals:backlog('p_withdrawals',"status IN ('pending','approved')"),
    failedGatewayAttempts:count("SELECT COUNT(*) n FROM p_gateway_transactions WHERE status IN ('failed','request_failed') AND updated_at>=?",week)+count("SELECT COUNT(*) n FROM p_bale_payments WHERE status IN ('failed','request_failed') AND updated_at>=?",week),
    cancelledGatewayAttempts:count("SELECT COUNT(*) n FROM p_gateway_transactions WHERE status='cancelled' AND updated_at>=?",week)+count("SELECT COUNT(*) n FROM p_bale_payments WHERE status='cancelled' AND updated_at>=?",week),
  };
}
