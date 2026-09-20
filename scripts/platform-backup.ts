import { loadEnvConfig } from "@next/env";
import { mkdirSync, chmodSync, copyFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { platformDb } from "../src/platform/schema";
loadEnvConfig(process.cwd());
async function main() {
  const directory = resolve(
    process.argv[2] || "backups",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, "homay.sqlite");
  await platformDb().backup(file);
  chmodSync(file, 0o600);
  if (existsSync(".env.local")) {
    const env = join(directory, "environment.private");
    copyFileSync(".env.local", env);
    chmodSync(env, 0o600);
  }
  console.log("Backup completed:", directory);
}
main().catch((e) => {
  console.error("Backup failed:", e instanceof Error ? e.name : "unknown");
  process.exitCode = 1;
});
