import { operationsApi } from "./operations-api";
import { loyaltyPolicy } from "./loyalty-engine";
import { assertAccess } from "./access";
import { resourceRoles } from "./access-model";
import { extensionAdmin, extensionMember } from "./extension-api";
import { binaryReport } from "./binary-report";
import {
  adjustPoints,
  saveMerchant,
  saveReward,
  redeemReward,
  reviewRedemption,
  clubSummary,
} from "./club";
import { serviceReadiness, recordServiceFailure } from "./readiness";
import { googleClientId, googleChallenge, googleIdentity } from "./google-auth";
import { installTravelPresets } from "./travel-presets";
import {
  cardsFor,
  issueTravelCards,
  travelCalendar,
  saveTravelRule,
  saveTravelCalendar,
  requestTravel,
  reviewTravel,
} from "./travel";
import {
  registrationSchema,
  referralCode,
  memberDetailsSchema,
  registrationEmail,
  registrationContact,
  verifyEmailSchema,
} from "./registration-model";
import { captchaConfig, verifyCaptcha } from "./captcha";
import {
  cartItemsSchema,
  checkoutSchema,
  quoteCart,
  createCheckout,
  payCheckout,
  settleCheckout,
} from "./checkout";
import { media } from "./media";
import { operations } from "./operations";
import { publicCatalogDetails } from "./catalog-model";
import { randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  ApiError,
  body,
  json,
  fail,
  sameOrigin,
  limit,
  hash,
} from "../server/http";
import { all, one, run, atomic, now, Row } from "./schema";
import {
  id,
  text,
  password,
  contact,
  productSchema,
  policySchema,
  role,
  iban,
  money,
  httpsImage,
} from "./validation";
import {
  audit,
  checkPassword,
  consumeOtp,
  encrypt,
  newTotpSecret,
  passwordHash,
  publicUser,
  session,
  sessionCookie,
  tokenOf,
  userOf,
  verifyTotp,
  ipOf,
  decrypt,
  matchingTotp,
  recoveryCodes,
  verifySecondFactor,
  dummyPassword,
} from "./security";
import {
  sendOtp,
  setting,
  saveSetting,
  policy,
  paymentRequest,
  verifyPayment,
} from "./providers";
import {
  createOrder,
  settleOrder,
  refundOrder,
  requestWithdrawal,
  reviewWithdrawal,
  wallet,
  rankProgress,
  sales,
  descendants,
  health,
  moveMember,
  notify,
} from "./finance";
import { invoice, exportReport } from "./exports";
const superRole = ["superadmin"];
const permissions = resourceRoles;
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const date = new Date(v + "T00:00:00.000Z");
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v
    );
  }, "invalid_date");
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  q: z.string().max(200).default(""),
  vertical: z
    .enum(["tourism", "beauty", "craft", "ai", "leather", ""])
    .default(""),
  status: z.string().max(30).default(""),
  from: calendarDate.optional(),
  to: calendarDate.optional(),
  user: z.string().uuid().optional(),
  kind: z.string().max(30).default(""),
  family: z.string().max(200).default(""),
});
function query(url: URL) {
  const q = querySchema.parse(Object.fromEntries(url.searchParams));
  if (q.from && q.to && q.from > q.to) throw new ApiError(400, "invalid_input");
  return {
    ...q,
    offset: (q.page - 1) * 30,
    from: q.from || "0000",
    to: q.to ? q.to + "T23:59:59.999Z" : "9999",
  };
}
function paged(sql: string, args: unknown[], page: number) {
  const rows = all(sql + " LIMIT 31 OFFSET ?", ...args, (page - 1) * 30);
  return { rows: rows.slice(0, 30), hasMore: rows.length > 30, page };
}
function respondSession(user: Row, req: Request, extra: Row = {}) {
  const response = json({ user: publicUser(user), ...extra });
  response.headers.set(
    "Set-Cookie",
    sessionCookie(session(user.id, req.headers.get("user-agent") || "")),
  );
  return response;
}
function revokeSessions(userId: string) {
  run("DELETE FROM p_sessions WHERE user_id=?", userId);
  run("DELETE FROM p_google_logins WHERE user_id=?", userId);
  run("DELETE FROM p_google_challenges WHERE user_id=?", userId);
}
function activeUser(target: string) {
  return one("SELECT * FROM p_users WHERE email=? OR phone=?", target, target);
}
function signup(data: Row, ip: string) {
  return atomic(() => {
    if (activeUser(data.target)) throw new ApiError(409, "account_exists");
    let sponsor: Row | undefined,
      parent: Row | undefined,
      leg: string | null = null;
    if (data.referral) {
      sponsor = one(
        "SELECT * FROM p_users WHERE referral_code=? AND blocked=0",
        data.referral,
      );
      if (!sponsor) throw new ApiError(400, "invalid_referral");
      const queue = [sponsor];
      for (let i = 0; i < queue.length && i < 10000; i++) {
        const candidate = queue[i];
        const children = all(
          "SELECT * FROM p_users WHERE parent_id=? ORDER BY leg",
          candidate.id,
        );
        if (children.length < 2) {
          parent = candidate;
          leg = children.some((c) => c.leg === "left") ? "right" : "left";
          break;
        }
        queue.push(...children);
      }
      if (!parent) throw new ApiError(409, "placement_full");
    }
    const user = randomUUID();
    run(
      "INSERT INTO p_users(id,email,phone,name,password,referral_code,sponsor_id,parent_id,leg,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      user,
      data.target.includes("@") ? data.target : null,
      data.target.includes("@") ? null : data.target,
      data.details.firstName + " " + data.details.lastName,
      passwordHash(data.password),
      randomUUID().replaceAll("-", "").slice(0, 12),
      sponsor?.id || null,
      parent?.id || null,
      leg,
      now(),
      now(),
      ip,
    );
    run("INSERT INTO p_wallets(user_id) VALUES(?)", user);
    run(
      "INSERT INTO p_member_details VALUES(?,?,?,?)",
      user,
      JSON.stringify(data.details),
      now(),
      now(),
    );
    run(
      "INSERT INTO p_consents VALUES(?,?,?,?,?,?,?,?)",
      randomUUID(),
      user,
      data.termsVersion,
      1,
      1,
      1,
      Number(data.marketingConsent),
      now(),
    );
    run(
      "UPDATE p_users SET preferences=? WHERE id=?",
      JSON.stringify({ email: data.marketingConsent, sms: false, inApp: true }),
      user,
    );
    if (
      process.env.TRUST_PROXY === "1" &&
      one(
        "SELECT COUNT(*) n FROM p_users WHERE signup_ip=? AND created_at>?",
        ip,
        new Date(Date.now() - 86400000).toISOString(),
      )!.n >= 5
    )
      run(
        "INSERT OR IGNORE INTO p_flags VALUES(?,?,?,?,0,?)",
        randomUUID(),
        user,
        "signup_ip",
        "چند ثبت‌نام از یک IP در ۲۴ ساعت؛ نیازمند بررسی انسانی",
        now(),
      );
    if (
      sponsor &&
      one(
        "SELECT COUNT(*) n FROM p_users WHERE sponsor_id=? AND created_at>?",
        sponsor.id,
        new Date(Date.now() - 3600000).toISOString(),
      )!.n >= 20
    )
      run(
        "INSERT OR IGNORE INTO p_flags VALUES(?,?,?,?,0,?)",
        randomUUID(),
        sponsor.id,
        "referral_velocity",
        "بیست معرفی یا بیشتر در یک ساعت؛ نیازمند بررسی انسانی",
        now(),
      );
    return one("SELECT * FROM p_users WHERE id=?", user)!;
  });
}
function beginEnrollment(target: string, googleSub?: string) {
  const secret = newTotpSecret(),
    token = randomBytes(32).toString("hex");
  atomic(() => {
    run(
      "DELETE FROM p_enrollments WHERE target=? OR expires<?",
      target,
      Date.now(),
    );
    run(
      "INSERT INTO p_enrollments VALUES(?,?,?,?,0,0)",
      hash(token),
      target,
      encrypt(secret),
      Date.now() + 900000,
    );
    if (googleSub)
      run(
        "INSERT INTO p_google_enrollments VALUES(?,?)",
        hash(token),
        googleSub,
      );
  });
  return {
    target,
    verificationToken: token,
    secret,
    expiresIn: 900,
    uri: `otpauth://totp/Homa:${encodeURIComponent(target)}?secret=${secret}&issuer=Homa&algorithm=SHA1&digits=6&period=30`,
  };
}
const loginSchema = z.object({
  target: contact,
  password: z.string().max(128).optional(),
  challenge: id.optional(),
  code: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  totp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  recoveryCode: z.string().max(30).optional(),
});
async function auth(req: Request, path: string[], data: Row) {
  const action = path[1];
  limit("auth-ip:" + ipOf(req), 30, 300);
  if (action === "google-challenge") {
    const d = z
      .object({ intent: z.enum(["login", "register", "link"]) })
      .parse(data);
    await verifyCaptcha(data.captchaToken, "login");
    return json(
      googleChallenge(d.intent, d.intent === "link" ? userOf(req).id : null),
    );
  }
  if (action === "google") {
    const d = z
      .object({
        challenge: z.string().regex(/^[a-f0-9]{64}$/),
        credential: z.string().min(20).max(10000),
        intent: z.enum(["login", "register", "link"]),
        password: z.string().max(128).optional(),
        totp: z.string().max(6).optional(),
        recoveryCode: z.string().max(30).optional(),
      })
      .parse(data);
    const boundUser = d.intent === "link" ? userOf(req) : null;
    const identity = await googleIdentity(
      d.challenge,
      d.credential,
      boundUser?.id || null,
    );
    if (identity.intent !== d.intent)
      throw new ApiError(401, "invalid_credentials");
    const linked = one(
      "SELECT u.* FROM p_google_identities g JOIN p_users u ON u.id=g.user_id WHERE g.subject=?",
      identity.sub,
    );
    if (d.intent === "link") {
      const current = userOf(req);
      if (!current) throw new ApiError(401, "invalid_credentials");
      limit("security:" + current.id, 8, 300);
      if (!checkPassword(d.password || "", current.password))
        throw new ApiError(401, "invalid_credentials");
      verifySecondFactor(current, d.totp || "", d.recoveryCode);
      atomic(() => {
        if (
          linked ||
          one(
            "SELECT user_id FROM p_google_identities WHERE user_id=?",
            current.id,
          )
        )
          throw new ApiError(409, "google_already_linked");
        run(
          "INSERT INTO p_google_identities VALUES(?,?,?)",
          identity.sub,
          current.id,
          now(),
        );
        audit(current.id, "security.google-link", current.id, null, {
          linked: true,
        });
        revokeSessions(current.id);
      });
      return json({ linked: true, reauthenticate: true });
    }
    if (d.intent === "register") {
      if (linked || activeUser(identity.email))
        throw new ApiError(409, "google_link_required");
      if (!identity.authoritative)
        throw new ApiError(400, "google_email_check_required");
      return json(
        beginEnrollment(registrationEmail.parse(identity.email), identity.sub),
      );
    }
    if (!linked || linked.blocked)
      throw new ApiError(401, "google_link_required");
    const token = randomBytes(32).toString("hex");
    atomic(() => {
      run("DELETE FROM p_google_logins WHERE expires<?", Date.now());
      run(
        "INSERT INTO p_google_logins VALUES(?,?,?,0)",
        hash(token),
        linked.id,
        Date.now() + 300000,
      );
    });
    return json({ googleTicket: token, twoFactor: !!linked.otp_secret });
  }
  if (action === "google-login") {
    const d = z
      .object({
        ticket: z.string().regex(/^[a-f0-9]{64}$/),
        totp: z.string().max(6).optional(),
        recoveryCode: z.string().max(30).optional(),
      })
      .parse(data);
    await verifyCaptcha(data.captchaToken, "login");
    const ticket = atomic(() => {
      const t = one(
        "SELECT * FROM p_google_logins WHERE token_hash=?",
        hash(d.ticket),
      );
      if (!t || t.expires <= Date.now() || t.attempts >= 5)
        throw new ApiError(401, "invalid_credentials");
      run(
        "UPDATE p_google_logins SET attempts=attempts+1 WHERE token_hash=?",
        t.token_hash,
      );
      return t;
    });
    const u = one("SELECT * FROM p_users WHERE id=?", ticket.user_id);
    if (
      !u ||
      u.blocked ||
      !one("SELECT subject FROM p_google_identities WHERE user_id=?", u.id)
    )
      throw new ApiError(401, "invalid_credentials");
    verifySecondFactor(u, d.totp || "", d.recoveryCode);
    return atomic(() => {
      const used = run(
        "DELETE FROM p_google_logins WHERE token_hash=? AND expires>?",
        ticket.token_hash,
        Date.now(),
      );
      if (!used.changes) throw new ApiError(401, "invalid_credentials");
      run("UPDATE p_users SET last_seen=? WHERE id=?", now(), u.id);
      return respondSession(u, req);
    });
  }
  if (action === "otp") {
    const d = z
      .object({
        target: contact,
        purpose: z.enum(["register", "login", "reset", "contact"]),
      })
      .parse(data);
    if (d.purpose === "contact") userOf(req);
    else await verifyCaptcha(data.captchaToken, "otp");
    if (d.purpose === "register") registrationContact.parse(d.target);
    return json(await sendOtp(d.target, d.purpose));
  }
  if (action === "verify-email" || action === "verify-contact") {
    const d = verifyEmailSchema.parse(data);
    if (action === "verify-email") registrationEmail.parse(d.target);
    await verifyCaptcha(d.captchaToken, "verify_email");
    consumeOtp(d.challenge, d.target, "register", d.code);
    if (activeUser(d.target)) throw new ApiError(409, "account_exists");
    return json(beginEnrollment(d.target));
  }
  if (action === "register") {
    const d = registrationSchema.parse(data);
    await verifyCaptcha(d.captchaToken, "register");
    if (
      d.referral &&
      !one(
        "SELECT id FROM p_users WHERE referral_code=? AND blocked=0",
        d.referral,
      )
    )
      throw new ApiError(400, "invalid_referral");
    // Reserve each attempt atomically across workers. A wrong TOTP must not
    // roll back this counter with the later account-creation transaction.
    const enrollment = atomic(() => {
      const pending = one(
        "SELECT * FROM p_enrollments WHERE token_hash=? AND target=?",
        hash(d.verificationToken),
        d.target,
      );
      if (
        !pending ||
        pending.used ||
        pending.expires <= Date.now() ||
        pending.attempts >= 5
      )
        throw new ApiError(401, "enrollment_expired");
      run(
        "UPDATE p_enrollments SET attempts=attempts+1 WHERE token_hash=?",
        pending.token_hash,
      );
      return pending;
    });
    const step = matchingTotp(decrypt(enrollment.secret), d.totp);
    if (step === undefined) throw new ApiError(401, "invalid_otp");
    const result = atomic(() => {
      const claimed = run(
        "UPDATE p_enrollments SET used=1 WHERE token_hash=? AND used=0 AND expires>?",
        enrollment.token_hash,
        Date.now(),
      );
      if (!claimed.changes) throw new ApiError(401, "enrollment_expired");
      const u = signup(d, ipOf(req));
      const google = one(
        "SELECT subject FROM p_google_enrollments WHERE token_hash=?",
        enrollment.token_hash,
      );
      if (google)
        run(
          "INSERT INTO p_google_identities VALUES(?,?,?)",
          google.subject,
          u.id,
          now(),
        );
      run(
        "UPDATE p_users SET otp_secret=?,otp_last=? WHERE id=?",
        enrollment.secret,
        step,
        u.id,
      );
      u.otp_secret = enrollment.secret;
      audit(u.id, "security.enrolled", u.id, null, {
        emailVerified: d.target.includes("@"),
        phoneVerified: !d.target.includes("@"),
        twoFactor: true,
        invitationMode: d.invitationMode,
      });
      return { u, codes: recoveryCodes(u.id) };
    });
    return respondSession(result.u, req, { recoveryCodes: result.codes });
  }
  if (action === "login") {
    const d = loginSchema.parse(data);
    await verifyCaptcha(data.captchaToken, "login");
    limit("login:" + hash(d.target), 8, 300);
    const u = activeUser(d.target);
    if (d.password) {
      const valid = checkPassword(d.password, u?.password || dummyPassword);
      if (!valid || !u || u.blocked)
        throw new ApiError(401, "invalid_credentials");
    } else {
      if (!d.challenge || !d.code) throw new ApiError(400, "invalid_input");
      consumeOtp(d.challenge, d.target, "login", d.code);
      if (!u || u.blocked) throw new ApiError(401, "invalid_credentials");
    }
    verifySecondFactor(u!, d.totp || "", d.recoveryCode);
    if (d.password && !u!.password.startsWith("s2:"))
      run(
        "UPDATE p_users SET password=? WHERE id=?",
        passwordHash(d.password),
        u!.id,
      );
    run("UPDATE p_users SET last_seen=? WHERE id=?", now(), u.id);
    return respondSession(u, req);
  }
  if (action === "reset") {
    const d = z
      .object({
        target: contact,
        password,
        challenge: id,
        code: z.string().regex(/^\d{6}$/),
        totp: z.string().optional(),
        recoveryCode: z.string().max(30).optional(),
      })
      .parse(data);
    await verifyCaptcha(data.captchaToken, "reset");
    consumeOtp(d.challenge, d.target, "reset", d.code);
    const u = activeUser(d.target);
    if (!u || u.blocked) throw new ApiError(401, "invalid_credentials");
    verifySecondFactor(u, d.totp || "", d.recoveryCode);
    atomic(() => {
      run(
        "UPDATE p_users SET password=? WHERE id=?",
        passwordHash(d.password),
        u.id,
      );
      revokeSessions(u.id);
    });
    return json({ ok: true });
  }
  if (action === "logout") {
    run("DELETE FROM p_sessions WHERE token_hash=?", hash(tokenOf(req)));
    const response = json({ ok: true });
    response.headers.set("Set-Cookie", sessionCookie("", 0));
    return response;
  }
  throw new ApiError(404, "not_found");
}
function network(u: Row, root: string, admin = false, page = 1) {
  if (!admin && root !== u.id && !descendants(u.id).some((d) => d.id === root))
    throw new ApiError(403, "forbidden");
  const r = one("SELECT id,name,referral_code FROM p_users WHERE id=?", root);
  if (!r) throw new ApiError(404, "not_found");
  const direct = all(
    "SELECT id,name,sponsor_id,parent_id,leg,1 depth FROM p_users WHERE sponsor_id=? ORDER BY created_at,id LIMIT 31 OFFSET ?",
    root,
    (page - 1) * 30,
  );
  const nodes = direct.slice(0, 30);
  for (const child of [...nodes])
    nodes.push(
      ...all(
        "SELECT id,name,sponsor_id,parent_id,leg,2 depth FROM p_users WHERE sponsor_id=? ORDER BY created_at,id LIMIT 30",
        child.id,
      ),
    );
  return {
    root: r,
    nodes,
    page,
    hasMore: direct.length > 30,
    successfulInvites: one(
      "SELECT COUNT(*) n FROM p_users WHERE sponsor_id=?",
      root,
    )!.n,
  };
}
function persianMonthStart() {
  const instant = new Date();
  const day = Number(
    new Intl.DateTimeFormat("en-u-ca-persian", {
      timeZone: "Asia/Tehran",
      day: "numeric",
    }).format(instant),
  );
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (key: string) => parts.find((p) => p.type === key)!.value;
  return new Date(
    Date.parse(
      `${value("year")}-${value("month")}-${value("day")}T00:00:00+03:30`,
    ) -
      (day - 1) * 86400000,
  ).toISOString();
}
export function reports(from: string, to: string) {
  const byVertical = all(
    "SELECT vertical,COUNT(*) orders,SUM(amount) sales FROM p_orders WHERE paid_at>=? AND paid_at<=? AND refunded_at IS NULL GROUP BY vertical",
    from,
    to,
  );
  const trend = all(
    `WITH events AS (
      SELECT substr(paid_at,1,10) day, amount sales, 0 commissions, 0 paid
      FROM p_orders WHERE paid_at>=? AND paid_at<=? AND refunded_at IS NULL
      UNION ALL
      SELECT substr(o.paid_at,1,10),0,c.amount,0 FROM p_commissions c
      JOIN p_orders o ON o.id=c.order_id
      WHERE o.paid_at>=? AND o.paid_at<=? AND c.status!='reversed'
      UNION ALL
      SELECT substr(updated_at,1,10),0,0,amount FROM p_withdrawals
      WHERE updated_at>=? AND updated_at<=? AND status='paid'
    ) SELECT day,SUM(sales) sales,SUM(commissions) commissions,SUM(paid) paid
      FROM events GROUP BY day ORDER BY day`,
    from,
    to,
    from,
    to,
    from,
    to,
  );
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const members = one(
    "SELECT COUNT(*) total,SUM(CASE WHEN created_at>=? AND created_at<=? THEN 1 ELSE 0 END) new_members,SUM(CASE WHEN last_seen>=? AND blocked=0 THEN 1 ELSE 0 END) active,SUM(CASE WHEN last_seen<? OR blocked=1 THEN 1 ELSE 0 END) inactive FROM p_users WHERE role='user'",
    from,
    to,
    cutoff,
    cutoff,
  )!;
  const referred = one(
    "SELECT COUNT(*) total,SUM(CASE WHEN EXISTS(SELECT 1 FROM p_orders o WHERE o.user_id=u.id AND o.paid_at IS NOT NULL AND o.refunded_at IS NULL) THEN 1 ELSE 0 END) buyers FROM p_users u WHERE sponsor_id IS NOT NULL AND created_at>=? AND created_at<=?",
    from,
    to,
  )!;
  const subscriptions = one(
    "SELECT COUNT(*) total,SUM(CASE WHEN cancelled=1 OR expires_at<? THEN 1 ELSE 0 END) lapsed FROM p_subscriptions WHERE starts_at>=? AND starts_at<=?",
    now(),
    from,
    to,
  )!;
  return {
    byVertical,
    trend,
    members,
    referralConversion: referred.total
      ? (referred.buyers || 0) / referred.total
      : 0,
    referred,
    subscriptionChurn: subscriptions.total
      ? (subscriptions.lapsed || 0) / subscriptions.total
      : 0,
    subscriptions,
    definitions: {
      active: "ورود در ۳۰ روز اخیر و حساب فعال",
      conversion:
        "اعضای معرفی‌شده در بازه که حداقل یک خرید غیرمرجوع دارند / کل معرفی‌شده‌های همان بازه",
      churn:
        "اشتراک‌های شروع‌شده در بازه که اکنون لغو یا منقضی شده‌اند / کل اشتراک‌های آن بازه",
    },
  };
}
async function admin(req: Request, path: string[], data: Row, url: URL) {
  const resource = path[1];
  const allowed = permissions[resource];
  if (resource === "access") {
    const owner = userOf(req, ["superadmin"]);
    return (await extensionAdmin(req, path, data, owner))!;
  }
  if (!allowed) throw new ApiError(404, "not_found");
  const u = userOf(req),
    q = query(url),
    get = req.method === "GET";
  assertAccess(u, resource, !get);
  const operation = operationsApi(req, path, data, u, true);
  if (operation) return operation;
  const extension = await extensionAdmin(req, path, data, u);
  if (extension) return extension;
  const entity = path[2];
  if (entity) id.parse(entity);
  if (
    ["binary", "merchants", "loyalty", "rewards", "redemptions"].includes(
      resource,
    )
  ) {
    if (path.length !== 2 || !["GET", "POST"].includes(req.method))
      throw new ApiError(405, "method_not_allowed");
    if (!get) limit("club-admin:" + u.id, 60, 300);
    if (resource === "binary") {
      if (!get) throw new ApiError(405, "method_not_allowed");
      return json(binaryReport(q.user || u.id, q.page));
    }
    if (resource === "merchants")
      return get
        ? json(
            paged(
              "SELECT * FROM p_merchants WHERE name LIKE ? OR city LIKE ? ORDER BY updated_at DESC,id",
              ["%" + q.q + "%", "%" + q.q + "%"],
              q.page,
            ),
          )
        : json(saveMerchant(u.id, data));
    if (resource === "loyalty") {
      if (!get) return json(adjustPoints(u.id, data));
      if (q.user) {
        if (!one("SELECT id FROM p_users WHERE id=?", q.user))
          throw new ApiError(404, "not_found");
        return json(clubSummary(q.user, q.page));
      }
      return json(
        paged(
          `SELECT l.*,u.name FROM p_points_ledger l JOIN p_users u ON u.id=l.user_id ORDER BY l.created_at DESC,l.id DESC`,
          [],
          q.page,
        ),
      );
    }
    if (resource === "rewards")
      return get
        ? json(
            paged(
              "SELECT * FROM p_rewards ORDER BY updated_at DESC,id",
              [],
              q.page,
            ),
          )
        : json(saveReward(u.id, data));
    return get
      ? json(
          paged(
            `SELECT r.*,u.name FROM p_redemptions r JOIN p_users u ON u.id=r.user_id WHERE (?='' OR r.status=?) ORDER BY r.created_at DESC,r.id DESC`,
            [q.status, q.status],
            q.page,
          ),
        )
      : json(reviewRedemption(u.id, data));
  }
  if (resource === "catalog-options")
    return json({
      rows: all("SELECT * FROM p_categories ORDER BY vertical,kind,name"),
    });
  if (resource === "operations")
    return json(operations(q.vertical, q.from, q.to));
  if (resource === "dashboard")
    return json({
      health: health(q.from, q.to),
      ...reports(q.from, q.to),
      pendingWithdrawals: one(
        "SELECT COUNT(*) n FROM p_withdrawals WHERE status='pending'",
      )!.n,
    });
  if (resource === "reports") {
    const r = reports(q.from, q.to);
    if (url.searchParams.has("format"))
      return exportReport(r, url.searchParams.get("format")!);
    return json(r);
  }
  if (resource === "readiness" && get) return json(serviceReadiness());
  if (resource === "settings") {
    if (get)
      return json({
        rows: all(
          "SELECT * FROM p_settings WHERE key!=?",
          "commission_policy",
        ).map((s) => ({
          key: s.key,
          value: s.secret ? "" : s.value,
          configured: true,
          secret: !!s.secret,
        })),
      });
    const d = z
      .object({
        key: z.enum([
          "google_client_id",
          "resend_key",
          "email_from",
          "turnstile_site_key",
          "turnstile_secret_key",
          "kavenegar_key",
          "sms_template",
          "sms_sender",
          "zarinpal_merchant",
          "site_name",
          "site_logo",
          "site_contact",
          "site_email",
          "site_ceo_name",
        ]),
        value: z.string().trim().min(1).max(2000),
        reason: text,
      })
      .parse(data);
    if (d.key === "google_client_id")
      z.string()
        .regex(/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/)
        .parse(d.value);
    if (d.key === "email_from" || d.key === "site_email")
      z.string().email().parse(d.value);
    if (d.key === "site_ceo_name")
      z.string().trim().min(2).max(120).parse(d.value);
    if (d.key === "site_logo") httpsImage.parse(d.value);
    const secret = [
      "resend_key",
      "turnstile_secret_key",
      "kavenegar_key",
      "zarinpal_merchant",
    ].includes(d.key);
    atomic(() => {
      const before = one("SELECT key FROM p_settings WHERE key=?", d.key);
      saveSetting(d.key, d.value, secret);
      audit(
        u.id,
        "settings.update",
        d.key,
        { configured: !!before },
        { configured: true, value: secret ? "[redacted]" : d.value },
        d.reason,
      );
    });
    return json({ ok: true });
  }
  if (resource === "policy") {
    if (get) {
      const p = setting("commission_policy");
      return json({ policy: p ? JSON.parse(p) : null });
    }
    const d = z.object({ policy: policySchema, reason: text }).parse(data);
    atomic(() => {
      const old = setting("commission_policy");
      saveSetting("commission_policy", JSON.stringify(d.policy));
      audit(
        u.id,
        "policy.update",
        "commission_policy",
        old ? JSON.parse(old) : null,
        d.policy,
        d.reason,
      );
    });
    return json({ ok: true });
  }
  if (resource === "products") {
    if (get)
      return json(
        paged(
          "SELECT p.*,d.details,d.sku,d.family FROM p_products p LEFT JOIN p_product_details d ON d.product_id=p.id WHERE (p.title LIKE ? OR d.sku LIKE ? OR d.family LIKE ?) AND (?='' OR p.vertical=?) ORDER BY p.created_at DESC",
          [
            "%" + q.q + "%",
            "%" + q.q + "%",
            "%" + q.q + "%",
            q.vertical,
            q.vertical,
          ],
          q.page,
        ),
      );
    if (req.method === "DELETE") {
      if (!entity) throw new ApiError(400, "invalid_input");
      const reason = text.parse(data.reason);
      atomic(() => {
        const old = one("SELECT * FROM p_products WHERE id=?", entity);
        if (!old) throw new ApiError(404, "not_found");
        if (one("SELECT id FROM p_orders WHERE product_id=?", entity))
          throw new ApiError(409, "product_has_orders");
        run("DELETE FROM p_products WHERE id=?", entity);
        audit(u.id, "product.delete", entity, old, null, reason);
      });
      return json({ ok: true });
    }
    const d = productSchema.parse(data);
    const key = d.id || randomUUID();
    atomic(() => {
      const before = one("SELECT * FROM p_products WHERE id=?", key);
      if (
        before &&
        ((d.expected_stock !== undefined &&
          before.stock !== d.expected_stock) ||
          (d.expected_updated_at &&
            before.updated_at !== d.expected_updated_at))
      )
        throw new ApiError(409, "product_changed");
      if (d.details?.comparePrice && d.details.comparePrice < d.price)
        throw new ApiError(400, "invalid_input");
      const previousDetails = one(
        "SELECT details FROM p_product_details WHERE product_id=?",
        key,
      );
      for (const category of d.taxonomy)
        if (!one("SELECT id FROM p_categories WHERE id=?", category))
          throw new ApiError(400, "invalid_taxonomy");
      run(
        `INSERT INTO p_products VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,vertical=excluded.vertical,subtype=excluded.subtype,price=excluded.price,stock=excluded.stock,images=excluded.images,taxonomy=excluded.taxonomy,published=excluded.published,duration_days=excluded.duration_days,cancel_hours=excluded.cancel_hours,updated_at=excluded.updated_at`,
        key,
        d.title,
        d.description,
        d.vertical,
        d.subtype,
        d.price,
        d.stock,
        JSON.stringify(d.images),
        JSON.stringify(d.taxonomy),
        Number(d.published),
        d.duration_days,
        d.cancel_hours,
        before?.created_at || now(),
        now(),
      );
      if (d.details)
        run(
          "INSERT INTO p_product_details VALUES(?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET sku=excluded.sku,family=excluded.family,details=excluded.details,updated_at=excluded.updated_at",
          key,
          d.details.sku || null,
          d.details.family,
          JSON.stringify(d.details),
          now(),
        );
      audit(
        u.id,
        "product.save",
        key,
        {
          ...before,
          details: previousDetails ? JSON.parse(previousDetails.details) : null,
        },
        d,
      );
    });
    return json({ id: key });
  }
  if (resource === "orders") {
    if (get)
      return json(
        paged(
          "SELECT o.*,u.name FROM p_orders o JOIN p_users u ON u.id=o.user_id WHERE (?='' OR o.vertical=?) AND (?='' OR o.status=?) AND o.created_at>=? AND o.created_at<=? AND (?='' OR o.user_id=?) AND (o.title LIKE ? OR o.id LIKE ?) ORDER BY o.created_at DESC",
          [
            q.vertical,
            q.vertical,
            q.status,
            q.status,
            q.from,
            q.to,
            q.user || "",
            q.user || "",
            "%" + q.q + "%",
            "%" + q.q + "%",
          ],
          q.page,
        ),
      );
    const d = z
      .object({
        id,
        action: z.enum(["processing", "shipped", "delivered", "refund"]),
        reason: text,
      })
      .parse(data);
    if (d.action === "refund") {
      assertAccess(u, "refunds", true);
      return json(refundOrder(d.id, u.id, true, d.reason));
    }
    atomic(() => {
      const o = one("SELECT * FROM p_orders WHERE id=?", d.id);
      if (!o) throw new ApiError(404, "not_found");
      const transitions: Record<string, string[]> = {
        processing: ["shipped", "delivered"],
        shipped: ["delivered"],
      };
      if (!o.paid_at || !transitions[o.status]?.includes(d.action))
        throw new ApiError(409, "invalid_state");
      run("UPDATE p_orders SET status=? WHERE id=?", d.action, d.id);
      audit(
        u.id,
        "order.status",
        d.id,
        { status: o.status },
        { status: d.action },
        d.reason,
      );
      notify(o.user_id, "وضعیت سفارش تغییر کرد", d.action);
    });
    return json({ ok: true });
  }
  if (resource === "withdrawals") {
    if (get)
      return json(
        paged(
          "SELECT w.*,u.name,r.first_actor,r.second_actor,a.name approver_name,b.name payer_name FROM p_withdrawals w JOIN p_users u ON u.id=w.user_id LEFT JOIN p_withdrawal_reviews r ON r.withdrawal_id=w.id LEFT JOIN p_users a ON a.id=r.first_actor LEFT JOIN p_users b ON b.id=r.second_actor WHERE (?='' OR w.status=?) ORDER BY w.created_at DESC",
          [q.status, q.status],
          q.page,
        ),
      );
    const d = z
      .object({
        id,
        status: z.enum(["approved", "rejected", "paid"]),
        reason: text,
        reference: z.string().trim().min(3).max(200).optional(),
      })
      .parse(data);
    return json(reviewWithdrawal(d.id, u.id, d.status, d.reason, d.reference));
  }
  if (resource === "users") {
    if (get && entity) {
      const member = one("SELECT * FROM p_users WHERE id=?", entity);
      if (!member) throw new ApiError(404, "not_found");
      return json({
        user: publicUser(member),
        memberDetails:
          one(
            "SELECT details,contact_verified_at FROM p_member_details WHERE user_id=?",
            entity,
          ) || null,
        consent:
          one(
            "SELECT version,accepted_at FROM p_consents WHERE user_id=? ORDER BY accepted_at DESC LIMIT 1",
            entity,
          ) || null,
        wallet: wallet(entity),
        rank: rankProgress(entity),
        orders: all(
          "SELECT * FROM p_orders WHERE user_id=? ORDER BY created_at DESC LIMIT 30",
          entity,
        ),
        commissions: all(
          "SELECT * FROM p_commissions WHERE user_id=? ORDER BY created_at DESC LIMIT 30",
          entity,
        ),
        network: network(u, entity, true),
      });
    }
    if (get)
      return json(
        paged(
          "SELECT id,name,email,phone,role,blocked,created_at,last_seen,referral_code FROM p_users WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? ORDER BY created_at DESC",
          ["%" + q.q + "%", "%" + q.q + "%", "%" + q.q + "%"],
          q.page,
        ),
      );
    const d = z
      .object({
        id,
        blocked: z.boolean().optional(),
        role: role.optional(),
        reason: text,
      })
      .parse(data);
    if (d.id === u.id) throw new ApiError(409, "cannot_modify_self");
    atomic(() => {
      const before = one("SELECT * FROM p_users WHERE id=?", d.id);
      if (!before) throw new ApiError(404, "not_found");
      if (
        (d.role ||
          before.role !== "user" ||
          one(
            "SELECT user_id FROM p_access_assignments WHERE user_id=?",
            d.id,
          )) &&
        u.role !== "superadmin"
      )
        throw new ApiError(403, "forbidden");
      run(
        "UPDATE p_users SET blocked=?,role=? WHERE id=?",
        d.blocked === undefined ? before.blocked : Number(d.blocked),
        d.role || before.role,
        d.id,
      );
      revokeSessions(d.id);
      audit(
        u.id,
        "user.update",
        d.id,
        { blocked: before.blocked, role: before.role },
        { blocked: d.blocked, role: d.role },
        d.reason,
      );
    });
    return json({ ok: true });
  }
  if (resource === "network") {
    if (get) return json(network(u, q.user || u.id, true, q.page));
    const d = z
      .object({
        id,
        sponsor: id.nullable(),
        parent: id.nullable(),
        leg: z.enum(["left", "right"]).nullable(),
        reason: text,
      })
      .refine((d) => !!d.parent === !!d.leg)
      .parse(data);
    moveMember(d.id, d.sponsor, d.parent, d.leg, u.id, d.reason);
    return json({ ok: true });
  }
  if (resource === "audit")
    return json(
      paged("SELECT * FROM p_audit ORDER BY created_at DESC", [], q.page),
    );
  if (resource === "commissions")
    return json(
      paged(
        "SELECT c.*,u.name FROM p_commissions c JOIN p_users u ON u.id=c.user_id WHERE c.created_at>=? AND c.created_at<=? AND (?='' OR c.kind=?) ORDER BY c.created_at DESC",
        [q.from, q.to, q.kind, q.kind],
        q.page,
      ),
    );
  if (resource === "flags") {
    if (get)
      return json(
        paged(
          "SELECT f.*,u.name FROM p_flags f JOIN p_users u ON u.id=f.user_id ORDER BY resolved,created_at DESC",
          [],
          q.page,
        ),
      );
    const d = z.object({ id, reason: text }).parse(data);
    atomic(() => {
      const old = one("SELECT * FROM p_flags WHERE id=?", d.id);
      if (!old) throw new ApiError(404, "not_found");
      run("UPDATE p_flags SET resolved=1 WHERE id=?", d.id);
      audit(u.id, "flag.resolve", d.id, old, { resolved: true }, d.reason);
    });
    return json({ ok: true });
  }
  const table = {
    ranks: "p_ranks",
    missions: "p_missions",
    taxonomy: "p_categories",
    content: "p_content",
  }[resource];
  if (table) {
    if (get)
      return json(paged(`SELECT * FROM ${table} ORDER BY id`, [], q.page));
    if (req.method === "DELETE") {
      if (!entity) throw new ApiError(400, "invalid_input");
      atomic(() => {
        const old = one(`SELECT * FROM ${table} WHERE id=?`, entity);
        run(`DELETE FROM ${table} WHERE id=?`, entity);
        audit(
          u.id,
          resource + ".delete",
          entity,
          old,
          null,
          text.parse(data.reason),
        );
      });
      return json({ ok: true });
    }
    let d: Row;
    let sql: string;
    let args: any[];
    const key = data.id ? id.parse(data.id) : randomUUID();
    if (resource === "ranks") {
      d = z
        .object({
          id: id.optional(),
          name: text,
          personal_threshold: z.number().int().min(0).max(1e12),
          group_threshold: z.number().int().min(0).max(1e12),
          bonus_bps: z.number().int().min(0).max(10000),
        })
        .parse(data);
      sql =
        "INSERT INTO p_ranks VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,personal_threshold=excluded.personal_threshold,group_threshold=excluded.group_threshold,bonus_bps=excluded.bonus_bps";
      args = [
        key,
        d.name,
        d.personal_threshold,
        d.group_threshold,
        d.bonus_bps,
      ];
    } else if (resource === "missions") {
      d = z
        .object({
          id: id.optional(),
          title: text,
          metric: z.enum([
            "personal_sales",
            "group_sales",
            "referrals",
            "orders",
          ]),
          target: money,
          active: z.boolean(),
        })
        .parse(data);
      sql =
        "INSERT INTO p_missions VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,metric=excluded.metric,target=excluded.target,active=excluded.active";
      args = [key, d.title, d.metric, d.target, Number(d.active)];
    } else if (resource === "taxonomy") {
      d = z
        .object({
          id: id.optional(),
          name: text,
          kind: z.enum(["category", "tag"]),
          vertical: z.enum(["tourism", "beauty", "craft", "ai", "leather"]),
        })
        .parse(data);
      sql =
        "INSERT INTO p_categories VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,vertical=excluded.vertical";
      args = [key, d.name, d.kind, d.vertical];
    } else {
      d = z
        .object({
          id: id.optional(),
          kind: z.enum(["blog", "banner", "page"]),
          slug: z.string().regex(/^[a-z0-9-]{1,100}$/),
          title: text,
          body: z.string().min(1).max(12000),
          image: httpsImage,
          published: z.boolean(),
        })
        .parse(data);
      sql =
        "INSERT INTO p_content VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,slug=excluded.slug,title=excluded.title,body=excluded.body,image=excluded.image,published=excluded.published,updated_at=excluded.updated_at";
      args = [
        key,
        d.kind,
        d.slug,
        d.title,
        d.body,
        d.image,
        Number(d.published),
        now(),
      ];
    }
    atomic(() => {
      const old = one(`SELECT * FROM ${table} WHERE id=?`, key);
      run(sql, ...args);
      audit(u.id, resource + ".save", key, old, d);
    });
    return json({ id: key });
  }
  throw new ApiError(404, "not_found");
}
export async function handle(req: Request, path: string[]) {
  try {
    const url = new URL(req.url),
      method = req.method,
      get = method === "GET";
    if (path[0] === "media") return await media(req, path);
    let data: Row = {};
    if (path.join("/") === "auth/config" && get)
      return json({
        ...captchaConfig(),
        smsRegistration: !!(
          setting("kavenegar_key") && setting("sms_template")
        ),
        googleEnabled: !!googleClientId(),
      });
    if (!get) {
      sameOrigin(req);
      data = await body(req, 65536);
    }
    if (path.join("/") === "referrals/check" && method === "POST") {
      limit("referral-check:" + ipOf(req), 15, 300);
      const code = referralCode.parse(data.code);
      return json({
        valid: !!one(
          "SELECT id FROM p_users WHERE referral_code=? AND blocked=0",
          code,
        ),
      });
    }
    if (path.join("/") === "income-plan" && get) {
      const raw = setting("commission_policy");
      if (!raw) return json({ configured: false });
      const p = policy();
      return json({
        configured: true,
        directBps: p.directBps,
        levels: p.levels,
        binaryBps: p.binaryBps,
        maxPayoutBps: p.maxPayoutBps,
        withdrawMin: p.withdrawMin,
        withdrawMax: p.withdrawMax,
        paused: p.paused,
        ranks: all(
          "SELECT name,personal_threshold,group_threshold,bonus_bps FROM p_ranks ORDER BY personal_threshold,group_threshold",
        ),
      });
    }
    if (path.join("/") === "auth/refresh" && method === "POST") {
      return atomic(() => {
        const u = userOf(req);
        limit("session-refresh:" + u.id, 20, 300);
        run("DELETE FROM p_sessions WHERE token_hash=?", hash(tokenOf(req)));
        return respondSession(u, req);
      });
    }
    if (path[0] === "auth" && method === "POST")
      return await auth(req, path, data);
    if (path.join("/") === "payment/callback" && get) {
      const authority = z
        .string()
        .min(10)
        .max(100)
        .parse(url.searchParams.get("Authority"));
      const checkout = one(
        "SELECT * FROM p_checkouts WHERE authority=?",
        authority,
      );
      if (checkout) {
        if (checkout.status !== "paid") {
          const ref = await verifyPayment(authority, checkout.amount);
          settleCheckout(checkout.id, ref);
        }
        return Response.redirect(
          new URL("/account?tab=orders", process.env.APP_ORIGIN!),
          303,
        );
      }
      const order = one("SELECT * FROM p_orders WHERE authority=?", authority);
      if (!order) throw new ApiError(404, "not_found");
      if (!order.paid_at) {
        const ref = await verifyPayment(authority, order.amount);
        settleOrder(order.id, ref);
      }
      return Response.redirect(
        new URL("/account?tab=orders", process.env.APP_ORIGIN!),
        303,
      );
    }
    if (path.join("/") === "cart/quote" && method === "POST") {
      limit("cart-quote:" + ipOf(req), 100, 300);
      return json(quoteCart(cartItemsSchema.parse(data.items)));
    }
    if (path[0] === "catalog" && get) {
      const q = query(url);
      const result = paged(
        "SELECT p.*,d.details FROM p_products p LEFT JOIN p_product_details d ON d.product_id=p.id WHERE p.published=1 AND (p.title LIKE ? OR d.sku LIKE ?) AND (?='' OR p.vertical=?) AND (?='' OR d.family=?) ORDER BY p.created_at DESC",
        [
          "%" + q.q + "%",
          "%" + q.q + "%",
          q.vertical,
          q.vertical,
          q.family,
          q.family,
        ],
        q.page,
      );
      return json({
        ...result,
        rows: result.rows.map((p) => ({
          ...p,
          details: publicCatalogDetails(p.details),
        })),
      });
    }
    if (path.join("/") === "club" && get)
      return json({
        policy: loyaltyPolicy(),
        levels: all(
          "SELECT name,threshold,benefits FROM p_loyalty_levels WHERE active=1 ORDER BY threshold LIMIT 100",
        ),
        rewards: all(
          "SELECT id,title,description,points,stock FROM p_rewards WHERE active=1 ORDER BY points,id LIMIT 100",
        ),
      });
    if (path[0] === "merchants" && get && path.length === 1) {
      const mq = query(url);
      return json(
        paged(
          `SELECT id,name,category,city,address,phone,website,description FROM p_merchants
        WHERE active=1 AND (name LIKE ? OR city LIKE ? OR category LIKE ?) ORDER BY name,id`,
          ["%" + mq.q + "%", "%" + mq.q + "%", "%" + mq.q + "%"],
          mq.page,
        ),
      );
    }
    if (path[0] === "content" && get) {
      const slug = url.searchParams.get("slug");
      return json({
        rows: slug
          ? all("SELECT * FROM p_content WHERE published=1 AND slug=?", slug)
          : all(
              "SELECT * FROM p_content WHERE published=1 ORDER BY updated_at DESC LIMIT 100",
            ),
      });
    }
    if (path[0] === "admin" && path[1] === "travel") {
      const actor = userOf(req);
      assertAccess(actor, "travel", !get);
      if (get)
        return json({
          liability: one(
            "SELECT COALESCE(SUM(available),0) AS available,COALESCE(SUM(reserved),0) AS reserved,COALESCE(SUM(spent),0) AS spent FROM p_travel_cards",
          ),
          rules: all(
            "SELECT t.*,r.name FROM p_travel_rules t JOIN p_ranks r ON r.id=t.rank_id",
          ),
          ranks: all("SELECT id,name FROM p_ranks ORDER BY name"),
          calendar: travelCalendar(),
          rows: all(
            "SELECT t.*,u.name FROM p_travel_requests t JOIN p_users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 100",
          ),
        });
      limit("travel-admin:" + actor.id, 60, 300);
      if (path[2] === "review") {
        if (data.status === "redeemed")
          assertAccess(actor, "travel-manage", true);
        return json(reviewTravel(actor.id, data));
      }
      assertAccess(actor, "travel-manage", true);
      if (path[2] === "presets") {
        return json({ presets: installTravelPresets(actor.id) });
      }
      if (path[2] === "rules") {
        saveTravelRule(actor.id, data);
        return json({ ok: true });
      }
      if (path[2] === "calendar") {
        saveTravelCalendar(actor.id, data);
        return json({ ok: true });
      }
      throw new ApiError(404, "not_found");
    }
    if (path[0] === "admin") return await admin(req, path, data, url);
    const u = userOf(req),
      q = query(url);
    if (!get) limit("member-write:" + u.id, 80, 300);
    const operation = operationsApi(req, path, data, u);
    if (operation) return operation;
    const extra = extensionMember(req, path, data, u);
    if (extra) return extra;
    if (path[0] === "member-details") {
      if (get)
        return json({
          profile:
            one(
              "SELECT details,contact_verified_at,updated_at FROM p_member_details WHERE user_id=?",
              u.id,
            ) || null,
          consent:
            one(
              "SELECT version,accepted_at FROM p_consents WHERE user_id=? ORDER BY accepted_at DESC LIMIT 1",
              u.id,
            ) || null,
        });
      const d = memberDetailsSchema.parse(data);
      atomic(() => {
        const before = one(
          "SELECT details FROM p_member_details WHERE user_id=?",
          u.id,
        );
        run(
          "INSERT INTO p_member_details VALUES(?,?,'',?) ON CONFLICT(user_id) DO UPDATE SET details=excluded.details,updated_at=excluded.updated_at",
          u.id,
          JSON.stringify(d),
          now(),
        );
        run(
          "UPDATE p_users SET name=? WHERE id=?",
          d.firstName + " " + d.lastName,
          u.id,
        );
        audit(u.id, "member.details", u.id, before?.details || null, d);
      });
      return json({ ok: true });
    }
    if (path[0] === "travel-cards") {
      if (get)
        return json({
          cards: cardsFor(u.id),
          rows: all(
            "SELECT * FROM p_travel_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
            u.id,
          ),
          calendar: travelCalendar(),
        });
      if (path[1] === "sync") return json({ cards: issueTravelCards(u.id) });
      if (path[1] === "requests") return json(requestTravel(u.id, data));
      if (path[1] === "cancel")
        return json(reviewTravel(u.id, { ...data, status: "cancelled" }, true));
      throw new ApiError(404, "not_found");
    }
    if (path[0] === "binary" && get && path.length === 1) {
      if (q.user && q.user !== u.id) throw new ApiError(403, "forbidden");
      return json(binaryReport(u.id, q.page));
    }
    if (path[0] === "loyalty") {
      if (path.length === 1 && get) return json(clubSummary(u.id, q.page));
      if (path.length === 2 && path[1] === "redeem" && method === "POST")
        return json(redeemReward(u.id, data), 201);
      throw new ApiError(405, "method_not_allowed");
    }
    if (path[0] === "me" && get) return json({ user: publicUser(u) });
    if (path[0] === "dashboard" && get) {
      const start = persianMonthStart();
      return json({
        wallet: wallet(u.id),
        sales: sales(u.id, start),
        rank: rankProgress(u.id),
        orders: all(
          "SELECT * FROM p_orders WHERE user_id=? ORDER BY created_at DESC LIMIT 5",
          u.id,
        ),
        commissions: all(
          "SELECT * FROM p_commissions WHERE user_id=? ORDER BY created_at DESC LIMIT 5",
          u.id,
        ),
      });
    }
    if (path[0] === "profile" && !get) {
      const d = z
        .object({
          name: text,
          preferences: z.object({
            email: z.boolean(),
            sms: z.boolean(),
            inApp: z.boolean(),
          }),
        })
        .parse(data);
      run(
        "UPDATE p_users SET name=?,preferences=? WHERE id=?",
        d.name,
        JSON.stringify(d.preferences),
        u.id,
      );
      return json({ ok: true });
    }
    if (path[0] === "contact" && !get) {
      limit("security:" + u.id, 8, 300);
      const d = z
        .object({
          target: contact,
          challenge: id,
          code: z.string().regex(/^\d{6}$/),
          password: z.string().max(128),
          totp: z
            .string()
            .regex(/^\d{6}$/)
            .optional(),
        })
        .parse(data);
      if (!checkPassword(d.password, u.password))
        throw new ApiError(401, "invalid_credentials");
      verifyTotp(u, d.totp || "");
      consumeOtp(d.challenge, d.target, "contact", d.code);
      run(
        `UPDATE p_users SET ${d.target.includes("@") ? "email" : "phone"}=? WHERE id=?`,
        d.target,
        u.id,
      );
      run(
        "DELETE FROM p_sessions WHERE user_id=? AND token_hash!=?",
        u.id,
        hash(tokenOf(req)),
      );
      run("DELETE FROM p_google_logins WHERE user_id=?", u.id);
      audit(u.id, "security.contact", u.id, null, {
        kind: d.target.includes("@") ? "email" : "phone",
      });
      return json({ ok: true });
    }
    if (path[0] === "security" && get)
      return json({
        googleLinked: !!one(
          "SELECT subject FROM p_google_identities WHERE user_id=?",
          u.id,
        ),
        twoFactor: !!u.otp_secret,
        recoveryRemaining: one(
          "SELECT COUNT(*) n FROM p_recovery_codes WHERE user_id=?",
          u.id,
        )!.n,
      });
    if (path[0] === "security" && !get) {
      limit("security:" + u.id, 8, 300);
      const d = z
        .object({
          action: z.enum([
            "password",
            "revoke",
            "totp-setup",
            "totp-enable",
            "totp-disable",
            "google-unlink",
            "recovery-regenerate",
          ]),
          currentPassword: z.string().max(128),
          newPassword: password.optional(),
          code: z.string().max(10).optional(),
          recoveryCode: z.string().max(30).optional(),
        })
        .parse(data);
      if (!checkPassword(d.currentPassword, u.password))
        throw new ApiError(401, "invalid_credentials");
      if (d.action === "totp-setup") {
        verifySecondFactor(u, d.code || "", d.recoveryCode);
        const secret = newTotpSecret();
        run(
          "UPDATE p_users SET otp_pending=? WHERE id=?",
          encrypt(secret),
          u.id,
        );
        run(
          "INSERT INTO p_totp_setups VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET expires=excluded.expires",
          u.id,
          Date.now() + 600000,
        );
        return json({
          secret,
          uri: `otpauth://totp/HomaySaadat:${encodeURIComponent(u.email || u.phone)}?secret=${secret}&issuer=HomaySaadat`,
        });
      }
      if (d.action === "totp-enable") {
        const setup = one(
          "SELECT expires FROM p_totp_setups WHERE user_id=?",
          u.id,
        );
        if (!u.otp_pending || !setup || setup.expires <= Date.now())
          throw new ApiError(409, "enrollment_expired");
        const step = matchingTotp(decrypt(u.otp_pending), d.code || "");
        if (step === undefined) throw new ApiError(401, "invalid_otp");
        const codes = atomic(() => {
          run(
            "UPDATE p_users SET otp_secret=otp_pending,otp_pending=NULL,otp_last=? WHERE id=?",
            step,
            u.id,
          );
          run("DELETE FROM p_totp_setups WHERE user_id=?", u.id);
          const codes = recoveryCodes(u.id);
          revokeSessions(u.id);
          audit(u.id, "security.totp-enable", u.id, null, { enabled: true });
          return codes;
        });
        return json({ ok: true, reauthenticate: true, recoveryCodes: codes });
      } else {
        verifySecondFactor(u, d.code || "", d.recoveryCode);
        if (d.action === "recovery-regenerate") {
          if (!u.otp_secret) throw new ApiError(409, "invalid_state");
          const codes = recoveryCodes(u.id);
          audit(u.id, "security.recovery-regenerate", u.id, null, {
            count: codes.length,
          });
          revokeSessions(u.id);
          return json({ ok: true, reauthenticate: true, recoveryCodes: codes });
        }
        if (d.action === "google-unlink")
          run("DELETE FROM p_google_identities WHERE user_id=?", u.id);
        if (d.action === "totp-disable") {
          run(
            "UPDATE p_users SET otp_secret=NULL,otp_pending=NULL,otp_last=0 WHERE id=?",
            u.id,
          );
          run("DELETE FROM p_recovery_codes WHERE user_id=?", u.id);
          run("DELETE FROM p_totp_setups WHERE user_id=?", u.id);
        }
        if (d.action === "password") {
          if (!d.newPassword) throw new ApiError(400, "invalid_input");
          run(
            "UPDATE p_users SET password=? WHERE id=?",
            passwordHash(d.newPassword),
            u.id,
          );
        }
      }
      revokeSessions(u.id);
      audit(u.id, "security." + d.action, u.id, null, {
        sessionsRevoked: true,
      });
      return json({ ok: true, reauthenticate: true });
    }
    if (path[0] === "checkouts") {
      if (get) {
        const c = one(
          "SELECT id,amount,status,method,expires_at FROM p_checkouts WHERE id=? AND user_id=?",
          id.parse(path[1]),
          u.id,
        );
        if (!c) throw new ApiError(404, "not_found");
        return json(c);
      }
      if (path[2] === "payment")
        return json(await payCheckout(id.parse(path[1]), u.id));
      if (path.length !== 1) throw new ApiError(404, "not_found");
      const c = createCheckout(u.id, checkoutSchema.parse(data));
      return json(
        { id: c.id, status: c.status, amount: c.amount, method: c.method },
        201,
      );
    }
    if (path[0] === "orders") {
      if (get && path[2] === "invoice") {
        const o = one(
          "SELECT * FROM p_orders WHERE id=? AND user_id=?",
          id.parse(path[1]),
          u.id,
        );
        if (!o || !o.paid_at) throw new ApiError(404, "not_found");
        return await invoice(o, u);
      }
      if (get) {
        if (path[1]) {
          const o = one(
            "SELECT * FROM p_orders WHERE id=? AND user_id=?",
            id.parse(path[1]),
            u.id,
          );
          if (!o) throw new ApiError(404, "not_found");
          return json(o);
        }
        return json(
          paged(
            "SELECT * FROM p_orders WHERE user_id=? AND (?='' OR vertical=?) AND (?='' OR status=?) AND (title LIKE ? OR id LIKE ?) ORDER BY created_at DESC",
            [
              u.id,
              q.vertical,
              q.vertical,
              q.status,
              q.status,
              "%" + q.q + "%",
              "%" + q.q + "%",
            ],
            q.page,
          ),
        );
      }
      if (path[2] === "cancel") {
        z.literal(true).parse(data.walletRefundConsent);
        return json(
          refundOrder(
            id.parse(path[1]),
            u.id,
            false,
            "درخواست کاربر؛ بازگشت به کیف پول",
          ),
        );
      }
      if (path[2] === "payment") {
        const group = one(
          "SELECT checkout_id FROM p_checkout_items WHERE order_id=?",
          id.parse(path[1]),
        );
        if (group) return json(await payCheckout(group.checkout_id, u.id));
        const order = one(
          "SELECT * FROM p_orders WHERE id=? AND user_id=?",
          id.parse(path[1]),
          u.id,
        );
        if (!order) throw new ApiError(404, "not_found");
        if (order.payment_method !== "zarinpal" || order.status !== "pending")
          throw new ApiError(409, "invalid_state");
        if (order.expires_at < now()) {
          refundOrder(order.id, u.id, false, "انقضای درخواست پرداخت");
          throw new ApiError(409, "invalid_state");
        }
        if (order.authority)
          return json({
            url: "https://www.zarinpal.com/pg/StartPay/" + order.authority,
          });
        const claim = randomUUID();
        if (
          !run(
            "UPDATE p_orders SET checkout_claim=? WHERE id=? AND checkout_claim IS NULL AND authority IS NULL",
            claim,
            order.id,
          ).changes
        )
          throw new ApiError(409, "payment_request_in_progress");
        try {
          const authority = await paymentRequest(order.id, order.amount);
          if (
            !run(
              "UPDATE p_orders SET authority=?,checkout_claim=NULL WHERE id=? AND checkout_claim=? AND status='pending'",
              authority,
              order.id,
              claim,
            ).changes
          )
            throw new ApiError(409, "invalid_state");
          return json({
            url: "https://www.zarinpal.com/pg/StartPay/" + authority,
          });
        } catch (e) {
          run(
            "UPDATE p_orders SET checkout_claim=NULL WHERE id=? AND checkout_claim=?",
            order.id,
            claim,
          );
          throw e;
        }
      }
      const d = z
        .object({
          productId: id,
          quantity: z.number().int().min(1).max(100),
          method: z.enum(["wallet", "zarinpal"]),
          idempotencyKey: id,
        })
        .parse(data);
      return json(
        createOrder(u.id, d.productId, d.quantity, d.method, d.idempotencyKey),
        201,
      );
    }
    if (path[0] === "wallet" && get) {
      const p = setting("commission_policy");
      return json({
        wallet: wallet(u.id),
        limits: p
          ? { min: JSON.parse(p).withdrawMin, max: JSON.parse(p).withdrawMax }
          : null,
        ...paged(
          "SELECT * FROM p_ledger WHERE user_id=? ORDER BY created_at DESC",
          [u.id],
          q.page,
        ),
      });
    }
    if (path[0] === "withdrawals") {
      if (get)
        return json(
          paged(
            "SELECT * FROM p_withdrawals WHERE user_id=? ORDER BY created_at DESC",
            [u.id],
            q.page,
          ),
        );
      const d = z
        .object({
          amount: money,
          iban,
          idempotencyKey: id,
          totp: z.string().optional(),
        })
        .parse(data);
      verifyTotp(u, d.totp || "");
      return json(
        requestWithdrawal(u.id, d.amount, d.iban, d.idempotencyKey),
        201,
      );
    }
    if (path[0] === "network" && get)
      return json(network(u, q.user || u.id, false, q.page));
    if (path[0] === "commissions" && get)
      return json(
        paged(
          "SELECT * FROM p_commissions WHERE user_id=? AND (?='' OR kind=?) AND created_at>=? AND created_at<=? ORDER BY created_at DESC",
          [u.id, q.kind, q.kind, q.from, q.to],
          q.page,
        ),
      );
    if (path[0] === "missions" && get) {
      const s = sales(u.id),
        counts = {
          personal_sales: s.personal,
          group_sales: s.group,
          referrals: one(
            "SELECT COUNT(*) n FROM p_users WHERE sponsor_id=?",
            u.id,
          )!.n,
          orders: one(
            "SELECT COUNT(*) n FROM p_orders WHERE user_id=? AND paid_at IS NOT NULL AND refunded_at IS NULL",
            u.id,
          )!.n,
        };
      return json({
        rows: all("SELECT * FROM p_missions WHERE active=1").map((m) => ({
          ...m,
          progress: counts[m.metric as keyof typeof counts],
        })),
      });
    }
    if (path[0] === "addresses") {
      if (get)
        return json({
          rows: all("SELECT * FROM p_addresses WHERE user_id=?", u.id),
        });
      if (method === "DELETE") {
        run(
          "DELETE FROM p_addresses WHERE id=? AND user_id=?",
          id.parse(path[1]),
          u.id,
        );
        return json({ ok: true });
      }
      const d = z
        .object({
          id: id.optional(),
          label: text,
          country: text,
          city: text,
          postal_code: z.string().min(3).max(30),
          address: z.string().min(5).max(1000),
        })
        .parse(data);
      const key = d.id || randomUUID();
      if (
        d.id &&
        !one("SELECT id FROM p_addresses WHERE id=? AND user_id=?", d.id, u.id)
      )
        throw new ApiError(404, "not_found");
      run(
        "INSERT INTO p_addresses VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,country=excluded.country,city=excluded.city,postal_code=excluded.postal_code,address=excluded.address",
        key,
        u.id,
        d.label,
        d.country,
        d.city,
        d.postal_code,
        d.address,
      );
      return json({ ok: true });
    }
    if (path[0] === "subscriptions") {
      if (get)
        return json(
          paged(
            "SELECT s.*,p.title FROM p_subscriptions s JOIN p_products p ON p.id=s.product_id WHERE user_id=? ORDER BY expires_at DESC",
            [u.id],
            q.page,
          ),
        );
      run(
        "UPDATE p_subscriptions SET cancelled=1 WHERE id=? AND user_id=?",
        id.parse(data.id),
        u.id,
      );
      return json({ ok: true });
    }
    if (path[0] === "notifications") {
      if (get)
        return json(
          paged(
            "SELECT * FROM p_notifications WHERE user_id=? ORDER BY created_at DESC",
            [u.id],
            q.page,
          ),
        );
      const d = z
        .object({ id: id.optional(), all: z.boolean().optional() })
        .refine((d) => d.id || d.all === true)
        .parse(data);
      run(
        "UPDATE p_notifications SET read_at=? WHERE user_id=? AND (?=1 OR id=?)",
        now(),
        u.id,
        Number(d.all === true),
        d.id || "",
      );
      return json({ ok: true });
    }
    throw new ApiError(404, "not_found");
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500)
      recordServiceFailure(
        path[0] === "auth"
          ? "authentication"
          : path[0] === "payment" || path[0] === "checkouts"
            ? "payment"
            : "service",
        e.code,
      );
    else if (!(e instanceof ApiError) && !(e instanceof z.ZodError))
      recordServiceFailure("server", "server_error");
    if (e instanceof z.ZodError)
      return json(
        {
          error: "invalid_input",
          details: e.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        400,
      );
    if (e instanceof Error && e.message.includes("UNIQUE constraint"))
      return json({ error: "duplicate_record" }, 409);
    if (e instanceof Error && e.message.includes("FOREIGN KEY constraint"))
      return json({ error: "invalid_reference" }, 400);
    return fail(e);
  }
}
