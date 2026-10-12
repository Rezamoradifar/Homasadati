import {reviewCompanyPositions} from "./company-members";
import { runBinaryCycles } from "./binary-schedule";
import { matureMerchantSales } from "./merchant-operations";
import { matureLoyalty, expirePoints } from "./loyalty-engine";
import { issueTravelCards, reviewTravel } from "./travel";
import { tehranDay } from "./travel-model";
import { atomic, all, one, run, now } from "./schema";
import { mature, refundOrder } from "./finance";
import { setting, saveSetting } from "./providers";
import { refreshUsdRate } from "./fx";
import { runCardSettlement } from "./seven-card-engine";
import { processNewsletter } from "./newsletter";
import { recheckPendingBalePayments } from "./bale-payments";
import { processOutbox } from "./outbox";
import {observeFinancialCycle} from "./operations-health";
export async function maintenance() {
  await refreshUsdRate();
  reviewCompanyPositions();
  observeFinancialCycle(() => runCardSettlement());
  runBinaryCycles();
  atomic(() => {
    mature();
    matureLoyalty();
    matureMerchantSales();
    for (const u of all(
      "SELECT DISTINCT user_id FROM p_points_lots WHERE remaining>0 AND expires_at<=? LIMIT 100",
      now(),
    ))
      expirePoints(u.user_id);
    run("DELETE FROM p_sessions WHERE expires<?", Date.now());
    run("DELETE FROM p_otp WHERE expires<?", Date.now() - 86400000);
    run(
      "UPDATE p_orders SET checkout_claim=NULL WHERE status='pending' AND expires_at<?",
      now(),
    );
    for (const order of all(
      "SELECT * FROM p_orders WHERE status='pending' AND checkout_claim IS NULL AND expires_at<?",
      now(),
    ))
      refundOrder(order.id, order.user_id, false, "انقضای سفارش پرداخت‌نشده");
  });
  const cursor = setting("travel_cards_cursor") || "";
  const members = all(
    "SELECT DISTINCT u.id FROM p_users u JOIN p_orders o ON o.user_id=u.id WHERE u.blocked=0 AND u.id>? AND o.vertical='craft' AND o.paid_at IS NOT NULL AND o.refunded_at IS NULL ORDER BY u.id LIMIT 100",
    cursor,
  );
  for (const member of members) issueTravelCards(member.id);
  saveSetting(
    "travel_cards_cursor",
    members.length ? members[members.length - 1].id : "",
  );
  for (const request of all(
    "SELECT t.id,t.user_id FROM p_travel_requests t JOIN p_travel_cards c ON c.id=t.card_id WHERE t.status='requested' AND (t.travel_date<=? OR c.expires_on<?) LIMIT 100",
    tehranDay(),
    tehranDay(),
  ))
    reviewTravel(
      request.user_id,
      {
        id: request.id,
        status: "cancelled",
        reason: "انقضای درخواست تأییدنشده",
      },
      true,
    );
  await processOutbox();
  await processNewsletter();
  // Bale attempts left pending (closed tab, timeout) are verified again.
  await recheckPendingBalePayments();
  saveSetting("worker_last_success", now());
  run("DELETE FROM p_google_challenges WHERE expires<?", Date.now());
  run("DELETE FROM p_google_logins WHERE expires<?", Date.now());
  run("DELETE FROM p_enrollments WHERE expires<?", Date.now());
}
