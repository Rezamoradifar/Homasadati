import { statfsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";
import { platformDb, one, now, atomic } from "./schema";
import { setting, saveSetting } from "./providers";
export function monitorAuthorized(header: string | null) {
  const token = process.env.MONITOR_TOKEN;
  if (!token || token.length < 32 || !header?.startsWith("Bearer "))
    return false;
  return timingSafeEqual(
    createHash("sha256").update(token).digest(),
    createHash("sha256").update(header.slice(7)).digest(),
  );
}
export function operationalStatus() {
  const checks: Record<string, boolean> = {
    database: false,
    worker: false,
    backup: false,
    offsite: false,
    disk: false,
    notifications: false,
  };
  const fresh = (key: string, age: number) => {
    const raw = setting(key);
    const elapsed = raw ? Date.now() - Date.parse(raw) : NaN;
    return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < age;
  };
  try {
    platformDb().prepare("SELECT 1").get();
    checks.database = true;
    checks.worker = fresh("worker_last_success", 180000);
    checks.backup = fresh("backup_last_success", 36 * 3600000);
    checks.offsite = fresh("offsite_last_success", 36 * 3600000);
    checks.notifications =
      one(
        "SELECT COUNT(*) n FROM p_outbox WHERE status IN ('pending','retry','sending') AND attempts>=8",
      )!.n === 0;
    const disk = statfsSync(
      dirname(resolve(process.env.DATABASE_PATH || "./data/homay.sqlite")),
    );
    const threshold = Number(process.env.MONITOR_MIN_FREE_BYTES || 536870912);
    checks.disk =
      Number.isSafeInteger(threshold) &&
      threshold >= 1048576 &&
      disk.bavail * disk.bsize >= threshold;
  } catch {}
  return {
    status: Object.values(checks).every(Boolean) ? "ok" : "attention",
    checks,
    checkedAt: now(),
  };
}
export async function sendOperationalAlert(
  status: ReturnType<typeof operationalStatus> & {
    checks: Record<string, boolean>;
  },
) {
  const configured = process.env.ALERT_WEBHOOK_URL;
  if (!configured) return { sent: false, configured: false };
  const target = new URL(configured);
  if (target.protocol !== "https:" || target.username || target.password)
    throw new Error("HTTPS alert endpoint required");
  const fingerprint = JSON.stringify(status.checks);
  // Claim a short lease before network I/O; failed attempts remain retryable.
  const claimed = atomic(() => {
    const last = setting("monitor_last_fingerprint"),
      lastAt = Date.parse(setting("monitor_last_alert") || "");
    if (last === fingerprint && Date.now() - lastAt < 3600000) return false;
    if (Number(setting("monitor_alert_lease") || 0) > Date.now()) return false;
    saveSetting("monitor_alert_lease", String(Date.now() + 30000));
    return true;
  });
  if (!claimed) return { sent: false, configured: true };
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: "homay-saadat", ...status }),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Alert rejected");
    atomic(() => {
      saveSetting("monitor_last_fingerprint", fingerprint);
      saveSetting("monitor_last_alert", now());
    });
    return { sent: true, configured: true };
  } finally {
    saveSetting("monitor_alert_lease", "0");
  }
}
