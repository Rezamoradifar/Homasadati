import { ApiError, json, limit } from "../server/http";
import { all, Row } from "./schema";
import { id } from "./validation";
import { binarySchedule, saveBinarySchedule } from "./binary-schedule";
import {
  createTicket,
  listTickets,
  ticketDetail,
  replyTicket,
  reviewTicket,
} from "./tickets";
import { reviewMerchantPayment } from "./merchant-operations";
export function operationsApi(
  req: Request,
  path: string[],
  data: Row,
  user: Row,
  staff = false,
): Response | null {
  const resource = path[staff ? 1 : 0],
    rest = path.slice(staff ? 2 : 1),
    get = req.method === "GET";
  if (staff && resource === "binary-schedule") {
    if (rest.length || !["GET", "POST"].includes(req.method))
      throw new ApiError(405, "method_not_allowed");
    if (!get) {
      limit("binary-schedule:" + user.id, 10, 300);
      return json(saveBinarySchedule(user.id, data));
    }
    return json({
      schedule: binarySchedule(),
      rows: all(
        "SELECT c.*,u.name user_name,o.title FROM p_binary_order_cycles c JOIN p_orders o ON o.id=c.order_id JOIN p_users u ON u.id=o.user_id ORDER BY c.created_at DESC,c.order_id LIMIT 100",
      ),
    });
  }
  if (staff && resource === "merchant-settlements" && rest[0] === "review") {
    if (rest.length !== 1 || req.method !== "POST")
      throw new ApiError(405, "method_not_allowed");
    limit("merchant-review:" + user.id, 60, 300);
    return json(reviewMerchantPayment(user.id, data));
  }
  if (resource !== "tickets") return null;
  if (!get) limit("ticket-write:" + user.id, 30, 300);
  const url = new URL(req.url);
  if (!rest.length && get) return json(listTickets(user, staff, url));
  if (!rest.length && req.method === "POST" && !staff)
    return json(createTicket(user, data));
  if (rest.length === 1) {
    const ticket = id.parse(rest[0]);
    if (get) return json(ticketDetail(user, ticket, staff, url));
    if (req.method === "PATCH")
      return json(reviewTicket(user, ticket, staff, data));
  }
  if (rest.length === 2 && rest[1] === "replies" && req.method === "POST")
    return json(replyTicket(user, id.parse(rest[0]), staff, data));
  throw new ApiError(405, "method_not_allowed");
}
