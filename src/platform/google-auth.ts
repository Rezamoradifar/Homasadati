import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "node:crypto";
import { ApiError, hash } from "../server/http";
import { atomic, one, run } from "./schema";
import { setting } from "./providers";
const client = new OAuth2Client({ transporterOptions: { timeout: 10000 } });
export const googleClientId = () =>
  process.env.GOOGLE_CLIENT_ID || setting("google_client_id") || "";
export function googleChallenge(
  intent: "login" | "register" | "link",
  userId: string | null,
) {
  if (!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleClientId()))
    throw new ApiError(503, "google_not_configured");
  const token = randomBytes(32).toString("hex"),
    nonce = randomBytes(32).toString("hex");
  atomic(() => {
    run("DELETE FROM p_google_challenges WHERE expires<?", Date.now());
    run(
      "INSERT INTO p_google_challenges VALUES(?,?,?,?,?)",
      hash(token),
      nonce,
      intent,
      userId,
      Date.now() + 300000,
    );
  });
  return { challenge: token, nonce, clientId: googleClientId() };
}
export async function googleIdentity(
  challenge: string,
  credential: string,
  userId: string | null,
) {
  const pending = atomic(() => {
    const row = one(
      "SELECT * FROM p_google_challenges WHERE token_hash=?",
      hash(challenge),
    );
    if (!row || row.expires <= Date.now() || row.user_id !== userId)
      throw new ApiError(401, "invalid_credentials");
    run("DELETE FROM p_google_challenges WHERE token_hash=?", row.token_hash);
    return row;
  });
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: googleClientId(),
    });
    const p = ticket.getPayload();
    if (
      !p ||
      !p.exp ||
      p.exp <= Date.now() / 1000 ||
      !p.iat ||
      p.iat > Date.now() / 1000 + 60 ||
      p.nonce !== pending.nonce ||
      !p.sub ||
      p.sub.length > 255 ||
      p.email_verified !== true ||
      !p.email ||
      p.email.length > 254
    )
      throw Error("claims");
    return {
      sub: p.sub,
      email: p.email.toLowerCase(),
      authoritative: p.email.toLowerCase().endsWith("@gmail.com") || !!p.hd,
      intent: pending.intent,
    };
  } catch {
    throw new ApiError(401, "google_verification_failed");
  }
}
