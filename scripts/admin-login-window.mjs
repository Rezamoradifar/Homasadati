import { readFileSync, writeFileSync, copyFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
const argument = process.argv[2];
let origin;
if (argument !== "off") {
  try {
    const url = new URL(argument);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw Error();
    origin = url.origin;
  } catch {
    console.error(
      "Usage: node scripts/admin-login-window.mjs https://your-domain.example | off",
    );
    process.exit(1);
  }
}
const path = resolve(".env.local");
let text;
try {
  text = readFileSync(path, "utf8");
} catch {
  console.error(
    "Run inside the installed app directory containing .env.local. No files changed.",
  );
  process.exit(1);
}
const backup = resolve(".env.admin-login-backup-" + Date.now() + ".local");
copyFileSync(path, backup);
chmodSync(backup, 0o600);
function set(key, value) {
  const expression = new RegExp(
    "^[ \\t]*(?:export[ \\t]+)?" + key + "[ \\t]*=.*$",
    "gm",
  );
  text = text.replace(expression, "");
  text = text.trimEnd() + "\n" + key + "=" + value + "\n";
}
const until =
  argument === "off"
    ? ""
    : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
if (origin) set("APP_ORIGIN", origin);
set("TEMP_ADMIN_PASSWORD_LOGIN_UNTIL", until);
writeFileSync(path, text, { mode: 0o600 });
chmodSync(path, 0o600);
console.log(
  argument === "off"
    ? "Temporary administrator password login disabled."
    : "Temporary superadmin password login enabled until " + until + " (UTC).",
);
console.log(
  "Saved .env.local; existing keys and database settings preserved. Restart the application to load this configuration.",
);
