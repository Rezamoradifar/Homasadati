import { loadEnvConfig } from "@next/env";
import { randomBytes, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { platformDb, one, run, now, atomic } from "../src/platform/schema";
import { passwordHash } from "../src/platform/security";
import { z } from "zod";
loadEnvConfig(process.cwd());
async function main() {
  platformDb();
  if (
    !process.env.PLATFORM_MASTER_KEY &&
    (one("SELECT key FROM p_settings WHERE secret=1 LIMIT 1") ||
      one("SELECT id FROM p_users WHERE otp_secret IS NOT NULL LIMIT 1"))
  )
    throw new Error(
      "Restore the existing PLATFORM_MASTER_KEY; encrypted data already exists.",
    );
  if (!process.env.PLATFORM_MASTER_KEY) {
    const key = randomBytes(32).toString("hex");
    const env = resolve(".env.local");
    appendFileSync(env, `\nPLATFORM_MASTER_KEY=${key}\n`, { mode: 0o600 });
    chmodSync(env, 0o600);
    process.env.PLATFORM_MASTER_KEY = key;
  }
  platformDb();
  if (one("SELECT id FROM p_users WHERE role='superadmin'")) {
    console.log(
      "Schema ready. A superadmin already exists; no credentials changed.",
    );
    return;
  }
  const input = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  let email = process.env.BOOTSTRAP_EMAIL;
  try {
    if (!email) email = await input.question("Superadmin email: ");
  } finally {
    input.close();
  }
  email = z.string().email().parse(email).toLowerCase();
  const file = resolve(".platform-bootstrap.txt");
  if (existsSync(file))
    throw new Error(
      "Bootstrap credential file already exists; inspect it manually.",
    );
  const password = randomBytes(24).toString("base64url");
  const id = randomUUID();
  atomic(() => {
    run(
      "INSERT INTO p_users(id,email,name,password,role,referral_code,created_at,last_seen,signup_ip) VALUES(?,?,?,?,'superadmin',?,?,?,?)",
      id,
      email,
      "مدیر همای سعادت",
      passwordHash(password),
      randomBytes(6).toString("hex"),
      now(),
      now(),
      "bootstrap",
    );
    run("INSERT INTO p_wallets(user_id) VALUES(?)", id);
    writeFileSync(
      file,
      `Admin URL: /admin\nEmail: ${email}\nTemporary password: ${password}\nChange this password inside the panel, enable 2FA, and delete this file.\n`,
      { mode: 0o600, flag: "wx" },
    );
  });
  console.log(
    "Admin created. Credentials are in .platform-bootstrap.txt (owner-read only). No products, ranks, balances or commission rates were seeded. Configure actual business policy in /admin.",
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Setup failed");
  process.exitCode = 1;
});
