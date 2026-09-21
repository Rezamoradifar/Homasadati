import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "../server/http";
import { all, one, run, atomic, now, Row } from "./schema";
import { audit } from "./security";
import { assertAccess } from "./access";
import { notify } from "./finance";
import { id } from "./validation";
import {
  ticketCreateSchema,
  ticketReplySchema,
  ticketReviewSchema,
  ticketCloseSchema,
  ticketStatuses,
} from "./operations-model";
function ticketFor(actor: Row, ticket: string, staff: boolean, write = false) {
  id.parse(ticket);
  if (staff) assertAccess(actor, "tickets", write);
  const row = one("SELECT * FROM p_tickets WHERE id=?", ticket);
  if (!row || (!staff && row.user_id !== actor.id))
    throw new ApiError(404, "not_found");
  return row;
}
function publicTicket(row: Row, staff: boolean) {
  const { payload, idem_key, ...safe } = row;
  if (!staff) delete safe.assignee_id;
  return safe;
}
export function listTickets(actor: Row, staff: boolean, url: URL) {
  if (staff) assertAccess(actor, "tickets");
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(url.searchParams.get("page") || 1);
  const status = z
    .enum(["", ...ticketStatuses])
    .parse(url.searchParams.get("status") || "");
  const q = z
    .string()
    .max(200)
    .parse(url.searchParams.get("q") || "");
  const rows = all(
    `SELECT t.*,u.name user_name FROM p_tickets t JOIN p_users u ON u.id=t.user_id WHERE (?=1 OR t.user_id=?) AND (?='' OR t.status=?) AND (t.subject LIKE ? OR t.id=?) ORDER BY t.updated_at DESC,t.id LIMIT 31 OFFSET ?`,
    Number(staff),
    actor.id,
    status,
    status,
    "%" + q + "%",
    q,
    (page - 1) * 30,
  );
  return {
    rows: rows.slice(0, 30).map((r) => publicTicket(r, staff)),
    page,
    hasMore: rows.length > 30,
  };
}
export function ticketDetail(
  actor: Row,
  ticket: string,
  staff: boolean,
  url: URL,
) {
  const t = ticketFor(actor, ticket, staff);
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(url.searchParams.get("page") || 1);
  const rows = all(
    "SELECT m.id,m.actor_id,m.body,m.internal,m.created_at,u.name author FROM p_ticket_messages m JOIN p_users u ON u.id=m.actor_id WHERE m.ticket_id=? AND (?=1 OR m.internal=0) ORDER BY m.rowid DESC LIMIT 31 OFFSET ?",
    ticket,
    Number(staff),
    (page - 1) * 30,
  );
  return {
    ticket: publicTicket(t, staff),
    rows: rows.slice(0, 30).reverse(),
    page,
    hasMore: rows.length > 30,
  };
}
export function createTicket(actor: Row, input: unknown) {
  const d = ticketCreateSchema.parse(input),
    payload = JSON.stringify(d);
  return atomic(() => {
    const old = one(
      "SELECT * FROM p_tickets WHERE user_id=? AND idem_key=?",
      actor.id,
      d.idempotencyKey,
    );
    if (old) {
      if (old.payload !== payload)
        throw new ApiError(409, "idempotency_conflict");
      return { id: old.id };
    }
    if (
      d.orderId &&
      !one(
        "SELECT id FROM p_orders WHERE id=? AND user_id=?",
        d.orderId,
        actor.id,
      )
    )
      throw new ApiError(404, "not_found");
    if (
      one(
        "SELECT COUNT(*) n FROM p_tickets WHERE user_id=? AND status!='closed'",
        actor.id,
      )!.n >= 20
    )
      throw new ApiError(409, "ticket_limit");
    const ticket = randomUUID();
    run(
      "INSERT INTO p_tickets(id,user_id,subject,category,priority,status,order_id,idem_key,payload,created_at,updated_at) VALUES(?,?,?,?,?,'waiting_support',?,?,?,?,?)",
      ticket,
      actor.id,
      d.subject,
      d.category,
      d.priority,
      d.orderId,
      d.idempotencyKey,
      payload,
      now(),
      now(),
    );
    run(
      "INSERT INTO p_ticket_messages VALUES(?,?,?,?,0,?,?,?)",
      randomUUID(),
      ticket,
      actor.id,
      d.body,
      d.idempotencyKey,
      payload,
      now(),
    );
    audit(actor.id, "ticket.create", ticket, null, {
      category: d.category,
      orderId: d.orderId,
    });
    return { id: ticket };
  });
}
export function replyTicket(
  actor: Row,
  ticket: string,
  staff: boolean,
  input: unknown,
) {
  const d = ticketReplySchema.parse(input),
    payload = JSON.stringify(d);
  return atomic(() => {
    const t = ticketFor(actor, ticket, staff, true);
    if (d.internal && !staff) throw new ApiError(403, "forbidden");
    const old = one(
      "SELECT id,payload FROM p_ticket_messages WHERE ticket_id=? AND actor_id=? AND idem_key=?",
      ticket,
      actor.id,
      d.idempotencyKey,
    );
    if (old) {
      if (old.payload !== payload)
        throw new ApiError(409, "idempotency_conflict");
      return { id: old.id };
    }
    if (
      !staff &&
      t.status === "closed" &&
      one(
        "SELECT COUNT(*) n FROM p_tickets WHERE user_id=? AND status!='closed'",
        actor.id,
      )!.n >= 20
    )
      throw new ApiError(409, "ticket_limit");
    const message = randomUUID();
    run(
      "INSERT INTO p_ticket_messages VALUES(?,?,?,?,?,?,?,?)",
      message,
      ticket,
      actor.id,
      d.body,
      Number(d.internal),
      d.idempotencyKey,
      payload,
      now(),
    );
    run(
      "UPDATE p_tickets SET status=?,updated_at=?,version=version+1 WHERE id=?",
      d.internal ? t.status : staff ? "waiting_user" : "waiting_support",
      now(),
      ticket,
    );
    audit(actor.id, d.internal ? "ticket.note" : "ticket.reply", ticket, null, {
      messageId: message,
    });
    // Do not put private support content into email/SMS queues.
    if (staff && !d.internal)
      notify(
        t.user_id,
        "پاسخ پشتیبانی",
        "پاسخ تازه‌ای برای درخواست شما ثبت شد؛ آن را در پنل پشتیبانی بخوانید.",
      );
    return { id: message };
  });
}
export function reviewTicket(
  actor: Row,
  ticket: string,
  staff: boolean,
  input: unknown,
) {
  const d = staff
    ? ticketReviewSchema.parse(input)
    : ticketCloseSchema.parse(input);
  return atomic(() => {
    const t = ticketFor(actor, ticket, staff, true);
    if (t.version !== d.expectedVersion)
      throw new ApiError(409, "record_changed");
    const s = staff
      ? ticketReviewSchema.parse(d)
      : {
          ...d,
          status: "closed",
          priority: t.priority,
          assigneeId: t.assignee_id,
        };
    if (staff && s.assigneeId) {
      const assignee = one(
        "SELECT * FROM p_users WHERE id=? AND blocked=0",
        s.assigneeId,
      );
      if (!assignee) throw new ApiError(404, "not_found");
      assertAccess(assignee, "tickets");
      assertAccess(assignee, "tickets", true);
    }
    run(
      "UPDATE p_tickets SET status=?,priority=?,assignee_id=?,version=version+1,updated_at=? WHERE id=?",
      s.status,
      s.priority,
      s.assigneeId,
      now(),
      ticket,
    );
    audit(
      actor.id,
      "ticket.review",
      ticket,
      { status: t.status, priority: t.priority, assigneeId: t.assignee_id },
      { status: s.status, priority: s.priority, assigneeId: s.assigneeId },
      d.reason,
    );
    if (staff && t.status !== s.status)
      notify(
        t.user_id,
        "وضعیت درخواست پشتیبانی",
        "وضعیت درخواست شما تغییر کرد؛ جزئیات در پنل پشتیبانی در دسترس است.",
      );
    return { ok: true };
  });
}
