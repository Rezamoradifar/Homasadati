import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
  randomUUID,
} from "node:crypto";
import { ApiError, hash, limit } from "../server/http";
import { one, run, now, atomic, Row } from "./schema";
export const SESSION_COOKIE = "homay_account";
export function encrypt(value: string) {
  const key = process.env.PLATFORM_MASTER_KEY;
  if (!key || !/^[a-f\d]{64}$/i.test(key))
    throw new ApiError(503, "encryption_not_configured");
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  return [
    iv.toString("hex"),
    c.update(value, "utf8", "hex") + c.final("hex"),
    c.getAuthTag().toString("hex"),
  ].join(".");
}
export function decrypt(value: string) {
  const key = process.env.PLATFORM_MASTER_KEY;
  if (!key) throw new ApiError(503, "encryption_not_configured");
  const [iv, data, tag] = value.split(".");
  const c = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    Buffer.from(iv, "hex"),
  );
  c.setAuthTag(Buffer.from(tag, "hex"));
  return c.update(data, "hex", "utf8") + c.final("utf8");
}
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function checkPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const out = scryptSync(password, salt, 64),
    expected = Buffer.from(key, "hex");
  return out.length === expected.length && timingSafeEqual(out, expected);
}
export function sessionCookie(token: string, age = 604800) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export function tokenOf(req: Request) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(SESSION_COOKIE + "="))
      ?.slice(SESSION_COOKIE.length + 1) || ""
  );
}
export function session(userId: string, agent: string) {
  const token = randomBytes(32).toString("hex");
  run(
    "INSERT INTO p_sessions VALUES(?,?,?,?,?)",
    hash(token),
    userId,
    Date.now() + 7 * 86400000,
    now(),
    agent.slice(0, 200),
  );
  return token;
}
export function userOf(req: Request, roles?: string[]) {
  const u = one(
    "SELECT u.* FROM p_users u JOIN p_sessions s ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?",
    hash(tokenOf(req)),
    Date.now(),
  );
  if (!u || u.blocked) throw new ApiError(401, "unauthorized");
  if (roles && !roles.includes(u.role)) throw new ApiError(403, "forbidden");
  return u;
}
export function publicUser(u: Row) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    referral_code: u.referral_code,
    preferences: JSON.parse(u.preferences),
    twoFactor: !!u.otp_secret,
  };
}
export function audit(
  actor: string,
  action: string,
  entity: string,
  before: unknown,
  after: unknown,
  reason = "",
) {
  run(
    "INSERT INTO p_audit VALUES(?,?,?,?,?,?,?,?)",
    randomUUID(),
    actor,
    action,
    entity,
    JSON.stringify(before ?? null),
    JSON.stringify(after ?? null),
    reason,
    now(),
  );
}
export function ipOf(req: Request) {
  return hash(
    process.env.TRUST_PROXY === "1"
      ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
      : "shared",
  );
}
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newTotpSecret() {
  let bits = "";
  for (const b of randomBytes(20)) bits += b.toString(2).padStart(8, "0");
  return bits
    .match(/.{5}/g)!
    .map((v) => alphabet[parseInt(v, 2)])
    .join("");
}
export function totp(secret: string, step = Math.floor(Date.now() / 30000)) {
  const bits = [...secret]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const count = Buffer.alloc(8);
  count.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", key).update(count).digest(),
    off = h[19] & 15;
  return ((h.readUInt32BE(off) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
export function verifyTotp(u: Row, code: string, secret = u.otp_secret) {
  if (!secret) return;
  limit("totp:" + u.id, 8, 300);
  const plain = decrypt(secret),
    step = Math.floor(Date.now() / 30000);
  const match = [step - 1, step, step + 1].find(
    (n) => n > u.otp_last && totp(plain, n) === code,
  );
  if (match === undefined) throw new ApiError(401, "invalid_otp");
  const changed = run(
    "UPDATE p_users SET otp_last=? WHERE id=? AND otp_last<?",
    match,
    u.id,
    match,
  );
  if (!changed.changes) throw new ApiError(401, "invalid_otp");
}
export function consumeOtp(
  challenge: string,
  target: string,
  purpose: string,
  code: string,
) {
  const error = atomic(() => {
    const r = one(
      "SELECT * FROM p_otp WHERE id=? AND target=? AND purpose=?",
      challenge,
      target,
      purpose,
    );
    if (!r || r.used || r.expires < Date.now() || r.attempts >= 5) return true;
    run("UPDATE p_otp SET attempts=attempts+1 WHERE id=?", challenge);
    if (hash(challenge + ":" + code) !== r.code_hash) return true;
    run("UPDATE p_otp SET used=1 WHERE id=?", challenge);
    return false;
  });
  if (error) throw new ApiError(401, "invalid_otp");
}
