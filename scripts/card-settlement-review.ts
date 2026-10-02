import { loadEnvConfig } from "@next/env";
import { all, platformDb } from "../src/platform/schema";
loadEnvConfig(process.cwd());
// Read-only classification report; no credentials, customer identities or mutations.
const rows = all(`SELECT COALESCE(json_extract(o.policy,'$.binaryEngine'),'unclassified') engine,
 COUNT(*) orders,COALESCE(SUM(o.amount),0) amount_toman
 FROM p_orders o WHERE o.paid_at IS NOT NULL AND o.refunded_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM p_card_orders c WHERE c.order_id=o.id)
 GROUP BY engine`);
console.log(JSON.stringify({unprocessedPaidOrders:rows},null,2));
platformDb().close();
