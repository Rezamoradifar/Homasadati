import { setting } from "./providers";
import { z } from "zod";
import { ApiError, json, limit } from "../server/http";
import { all, one, run, atomic, now, Row } from "./schema";
import { audit } from "./security";
import { id, text } from "./validation";
import { binaryRules, saveBinaryRules } from "./network-rules";
import { binaryQuote, simulationSchema } from "./network-rules-model";
import {
  loyaltyPolicy,
  saveLoyaltyPolicy,
  saveLoyaltyLevel,
} from "./loyalty-engine";
import { saveAccessRole, assignAccessRole } from "./access";
import { permissionOptions } from "./access-model";
import {
  saveContract,
  linkMerchantProduct,
  recordMerchantPayment,
  merchantWorkspace,
  merchantFulfill,
} from "./merchant-operations";
import { reviewRedemption } from "./club";
import { notify } from "./finance";
function pageOf(req: Request) {
  return z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(new URL(req.url).searchParams.get("page") || 1);
}
function paged(sql: string, args: unknown[], page: number) {
  const rows = all(sql + " LIMIT 31 OFFSET ?", ...args, (page - 1) * 30);
  return { rows: rows.slice(0, 30), hasMore: rows.length > 30, page };
}
const notificationSchema = z
  .object({
    userIds: z.array(id).min(1).max(100),
    title: text,
    body: z.string().trim().min(1).max(4000),
    idempotencyKey: id,
    reason: text,
  })
  .strict();
export async function extensionAdmin(
  req: Request,
  path: string[],
  data: Row,
  u: Row,
): Promise<Response | null> {
  const resource = path[1];
  if (
    ![
      "binary-rules",
      "binary-simulate",
      "loyalty-policy",
      "loyalty-levels",
      "access",
      "merchant-operations",
      "merchant-settlements",
      "notifications",
    ].includes(resource)
  )
    return null;
  const get = req.method === "GET",
    page = pageOf(req);
  if (!["GET", "POST"].includes(req.method))
    throw new ApiError(405, "method_not_allowed");
  if (!get) limit("extension-admin:" + u.id, 60, 300);
  if (
    [
      "binary-rules",
      "binary-simulate",
      "loyalty-policy",
      "loyalty-levels",
      "merchant-settlements",
      "notifications",
    ].includes(resource) &&
    path.length !== 2
  )
    throw new ApiError(404, "not_found");
  if (resource === "binary-rules")
    return json(get ? { rules: binaryRules() } : saveBinaryRules(u.id, data));
  if (resource === "binary-simulate") {
    if (get) throw new ApiError(405, "method_not_allowed");
    return json(binaryQuote(simulationSchema.parse(data)));
  }
  if (resource === "loyalty-policy")
    return json(
      get
        ? { policy: loyaltyPolicy(), configured: !!setting("loyalty_policy") }
        : saveLoyaltyPolicy(u.id, data),
    );
  if (resource === "loyalty-levels")
    return json(
      get
        ? paged(
            "SELECT * FROM p_loyalty_levels ORDER BY threshold,id",
            [],
            page,
          )
        : saveLoyaltyLevel(u.id, data),
    );
  if (resource === "access") {
    if (u.role !== "superadmin") throw new ApiError(403, "forbidden");
    if (path.length === 2 && get)
      return json({
        ...paged("SELECT * FROM p_access_roles ORDER BY name,id", [], page),
        options: permissionOptions,
        assignments: paged(
          "SELECT a.*,u.name user_name,r.name role_name FROM p_access_assignments a JOIN p_users u ON u.id=a.user_id JOIN p_access_roles r ON r.id=a.role_id ORDER BY a.created_at DESC,a.user_id,a.role_id",
          [],
          page,
        ),
      });
    if (path.length === 2 && !get) return json(saveAccessRole(u.id, data));
    if (path.length === 3 && path[2] === "assign" && !get)
      return json(assignAccessRole(u.id, data));
    throw new ApiError(404, "not_found");
  }
  if (resource === "merchant-operations") {
    if (path.length === 2 && get)
      return json({
        ...paged(
          "SELECT c.*,m.name,u.name owner_name FROM p_merchant_contracts c JOIN p_merchants m ON m.id=c.merchant_id JOIN p_users u ON u.id=c.owner_id ORDER BY c.updated_at DESC,c.merchant_id",
          [],
          page,
        ),
        links: paged(
          "SELECT x.*,p.title,m.name merchant_name FROM p_product_merchants x JOIN p_products p ON p.id=x.product_id JOIN p_merchants m ON m.id=x.merchant_id ORDER BY p.title,p.id",
          [],
          page,
        ),
      });
    if (path.length === 2 && !get) return json(saveContract(u.id, data));
    if (path.length === 3 && path[2] === "products" && !get)
      return json(linkMerchantProduct(u.id, data));
    throw new ApiError(404, "not_found");
  }
  if (resource === "merchant-settlements")
    return json(
      get
        ? {
            ...paged(
              "SELECT l.*,m.name FROM p_merchant_ledger l JOIN p_merchants m ON m.id=l.merchant_id ORDER BY l.created_at DESC,l.id DESC",
              [],
              page,
            ),
            balances: paged(
              "SELECT m.id,m.name,COALESCE(SUM(l.amount),0) balance,(SELECT COALESCE(SUM(r.amount),0) FROM p_merchant_payment_reviews r WHERE r.merchant_id=m.id AND r.status='pending') reserved FROM p_merchants m LEFT JOIN p_merchant_ledger l ON l.merchant_id=m.id GROUP BY m.id ORDER BY m.name,m.id",
              [],
              page,
            ),
            reviews: paged(
              "SELECT r.*,m.name merchant_name,a.name first_name,b.name second_name FROM p_merchant_payment_reviews r JOIN p_merchants m ON m.id=r.merchant_id JOIN p_users a ON a.id=r.first_actor LEFT JOIN p_users b ON b.id=r.second_actor ORDER BY r.created_at DESC,r.id",
              [],
              page,
            ),
            payments: paged(
              "SELECT id,merchant_id,amount,bank_reference,reason,created_at FROM p_merchant_payments ORDER BY created_at DESC,id DESC",
              [],
              page,
            ),
          }
        : recordMerchantPayment(u.id, data),
    );
  if (resource === "notifications") {
    if (get)
      return json(
        paged(
          "SELECT id,actor_id,created_at FROM p_announcements ORDER BY created_at DESC,id DESC",
          [],
          page,
        ),
      );
    const d = notificationSchema.parse(data);
    d.userIds = [...new Set(d.userIds)].sort();
    const payload = JSON.stringify(d);
    return json(
      atomic(() => {
        const old = one(
          "SELECT payload FROM p_announcements WHERE id=?",
          d.idempotencyKey,
        );
        if (old) {
          if (old.payload !== payload)
            throw new ApiError(409, "idempotency_conflict");
          return { ok: true, count: d.userIds.length };
        }
        for (const target of d.userIds)
          if (!one("SELECT id FROM p_users WHERE id=? AND blocked=0", target))
            throw new ApiError(404, "not_found");
        run(
          "INSERT INTO p_announcements VALUES(?,?,?,?)",
          d.idempotencyKey,
          u.id,
          payload,
          now(),
        );
        for (const target of d.userIds) notify(target, d.title, d.body);
        audit(
          u.id,
          "notification.send",
          d.idempotencyKey,
          null,
          { count: d.userIds.length },
          d.reason,
        );
        return { ok: true, count: d.userIds.length };
      }),
    );
  }
  return null;
}
export function extensionMember(
  req: Request,
  path: string[],
  data: Row,
  u: Row,
): Response | null {
  if (path[0] === "merchant") {
    if (path.length === 1 && req.method === "GET")
      return json(merchantWorkspace(u.id, pageOf(req)));
    if (path.length === 2 && path[1] === "orders" && req.method === "POST")
      return json(merchantFulfill(u.id, data));
    throw new ApiError(405, "method_not_allowed");
  }
  if (path.join("/") === "loyalty/cancel") {
    if (req.method !== "POST") throw new ApiError(405, "method_not_allowed");
    const d = z.object({ id, reason: text }).strict().parse(data);
    return json(
      atomic(() => {
        if (
          !one(
            "SELECT id FROM p_redemptions WHERE id=? AND user_id=?",
            d.id,
            u.id,
          )
        )
          throw new ApiError(404, "not_found");
        return reviewRedemption(u.id, { ...d, status: "cancelled" });
      }),
    );
  }
  return null;
}
