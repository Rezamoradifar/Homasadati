import {one} from "./schema";
/** Counts only. Tehran local day, no customer data or financial credentials. */
export function launchDashboard(at=Date.now()) {
  const day=86400000,shift=12600000;
  const today=new Date(Math.floor((at+shift)/day)*day-shift).toISOString();
  const week=new Date(at-7*day).toISOString();
  const count=(sql:string,...args:any[])=>one(sql,...args)!.n as number;
  const backlog=(table:string,where:string,column='created_at')=>one(`SELECT COUNT(*) count,MIN(${column}) oldest FROM ${table} WHERE ${where}`)!;
  return {since:today,weekSince:week,
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
