import {effectivePermissions} from "./access";
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
  return (
    "s2:" +
    salt +
    ":" +
    scryptSync(password, salt, 64, {
      N: 32768,
      r: 8,
      p: 3,
      maxmem: 64 * 1024 * 1024,
    }).toString("hex")
  );
}
export function checkPassword(password: string, stored: string) {
  const modern = stored.startsWith("s2:");
  const [salt, key] = (modern ? stored.slice(3) : stored).split(":");
  if (!salt || !key) return false;
  const out = scryptSync(
      password,
      salt,
      64,
      modern ? { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 } : {},
    ),
    expected = Buffer.from(key, "hex");
  return out.length === expected.length && timingSafeEqual(out, expected);
}
// Match the work performed for a current password when the account does not exist.
export const dummyPassword = "s2:" + "0".repeat(32) + ":" + "0".repeat(128);
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
    permissions: effectivePermissions(u),
    merchant:!!one("SELECT merchant_id FROM p_merchant_contracts WHERE owner_id=?",u.id),
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
export function matchingTotp(secret: string, code: string) {
  const step = Math.floor(Date.now() / 30000);
  return [step - 1, step, step + 1].find((n) => totp(secret, n) === code);
}
export function recoveryCodes(userId: string) {
  return atomic(() => {
    run("DELETE FROM p_recovery_codes WHERE user_id=?", userId);
    const codes = Array.from({ length: 10 }, () =>
      randomBytes(10).toString("hex").match(/.{4}/g)!.join("-"),
    );
    for (const code of codes)
      run(
        "INSERT INTO p_recovery_codes VALUES(?,?,?)",
        userId,
        hash(userId + ":" + code.replaceAll("-", "")),
        now(),
      );
    return codes;
  });
}
export function verifySecondFactor(u: Row, code: string, recovery?: string) {
  if (!u.otp_secret) return;
  if (!recovery) {
    verifyTotp(u, code);
    return;
  }
  limit("recovery:" + u.id, 5, 300);
  const normalized = recovery.toLowerCase().replaceAll("-", "").trim();
  if (!/^[a-f0-9]{20}$/.test(normalized))
    throw new ApiError(401, "invalid_otp");
  const consumed = run(
    "DELETE FROM p_recovery_codes WHERE user_id=? AND code_hash=?",
    u.id,
    hash(u.id + ":" + normalized),
  );
  if (!consumed.changes) throw new ApiError(401, "invalid_otp");
  audit(u.id, "security.recovery-used", u.id, null, {
    remaining: one(
      "SELECT COUNT(*) n FROM p_recovery_codes WHERE user_id=?",
      u.id,
    )!.n,
  });
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
