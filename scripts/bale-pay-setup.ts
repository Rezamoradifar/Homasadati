import { loadEnvConfig } from "@next/env";
import { resolve } from "node:path";
import { baleApi } from "../src/platform/bale-api";
import { baleConfig, baleConfigValid, baleWebhookUrl } from "../src/platform/bale-config";

export type BaleSetupMode = "check" | "register";
type Config = ReturnType<typeof baleConfig>;
type SetupApi = Pick<ReturnType<typeof baleApi>, "getMe" | "getWebhookInfo" | "setWebhook">;

type FailureCode =
  | "invalid_arguments"
  | "configuration_incomplete"
  | "unexpected_bot"
  | "existing_webhook_conflict"
  | "webhook_registration_unconfirmed"
  | "registration_save_failed";

export class BaleSetupError extends Error {
  constructor(readonly code: FailureCode) {
    super(code);
    this.name = "BaleSetupError";
  }
}

/** Only fixed, local messages are shown. A provider error can contain credentials. */
export function setupFailureMessage(error: unknown): string {
  const messages: Record<FailureCode, string> = {
    invalid_arguments: "Use --check or --register. Do not pass credentials as arguments.",
    configuration_incomplete: "Bale configuration is incomplete or invalid. Check the private server environment and docs/BALE-PAYMENTS.md.",
    unexpected_bot: "The bot token does not match the configured bot username. No webhook was changed.",
    existing_webhook_conflict: "This bot already has a different webhook. Review its current integration before making any changes; it was not overwritten.",
    webhook_registration_unconfirmed: "The expected webhook could not be confirmed. Registration was not saved; run --check before retrying --register.",
    registration_save_failed: "The webhook matches, but registration could not be saved. Check the database path and permissions, then retry --register.",
  };
  return error instanceof BaleSetupError
    ? messages[error.code]
    : "Bale setup could not complete. Check private credentials, connectivity and server configuration. Provider details were not printed.";
}

export function parseSetupMode(args: string[]): BaleSetupMode | "help" {
  if (!args.length || (args.length === 1 && args[0] === "--check")) return "check";
  if (args.length === 1 && args[0] === "--register") return "register";
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) return "help";
  throw new BaleSetupError("invalid_arguments");
}

/**
 * --check makes provider reads only: it never opens the application database.
 * --register records the exact configuration only after observing its webhook.
 * No messages, invoices, payments, polling or enable-setting changes happen here.
 */
export async function runBaleSetup(
  mode: BaleSetupMode,
  config: Config,
  dependencies: {
    api: SetupApi;
    saveRegistration: (fingerprint: string) => void | Promise<void>;
  },
) {
  if (!baleConfigValid(config, false)) throw new BaleSetupError("configuration_incomplete");
  const me = await dependencies.api.getMe();
  if (!me.is_bot || me.username.toLowerCase() !== config.botUsername.toLowerCase())
    throw new BaleSetupError("unexpected_bot");

  const expected = baleWebhookUrl(config);
  let hook = await dependencies.api.getWebhookInfo();
  let registrationSaved = false;
  if (mode === "register") {
    if (hook.url && hook.url !== expected) throw new BaleSetupError("existing_webhook_conflict");
    if (!hook.url) await dependencies.api.setWebhook(expected);
    // Observe provider state even if the original hook already matched. A
    // successful setter response by itself is not a registration confirmation.
    hook = await dependencies.api.getWebhookInfo();
    if (hook.url !== expected) throw new BaleSetupError("webhook_registration_unconfirmed");
    try {
      await dependencies.saveRegistration(config.configFingerprint);
      registrationSaved = true;
    } catch {
      throw new BaleSetupError("registration_save_failed");
    }
  }

  // The bot name is public. All other output values are booleans; never add
  // provider responses, URLs, tokens, fingerprints or error descriptions here.
  return {
    bot: "@" + config.botUsername,
    configurationValid: true,
    enabledSetting: config.enabled,
    botVerified: true,
    webhookPresent: !!hook.url,
    webhookMatches: hook.url === expected,
    registrationSaved,
    readOnly: mode === "check",
  };
}

async function saveRegistration(fingerprint: string) {
  // Lazy import is intentional: the read-only check must not run migrations.
  const { platformDb, run, now } = await import("../src/platform/schema");
  const database = platformDb();
  try {
    run(
      "INSERT INTO p_bale_runtime(key,value,updated_at) VALUES('registered_config',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
      fingerprint,
      now(),
    );
  } finally {
    database.close();
  }
}

async function main() {
  try {
    const mode = parseSetupMode(process.argv.slice(2));
    if (mode === "help") {
      console.log("Usage: npm run platform:bale-setup -- [--check | --register]");
      console.log("--check (default): verify the bot and inspect its webhook without changes.");
      console.log("--register: register an empty webhook, or confirm an identical one, then save registration.");
      return;
    }
    loadEnvConfig(process.cwd());
    const config = baleConfig();
    const report = await runBaleSetup(mode, config, {
      api: baleApi({ botToken: config.botToken, providerToken: config.providerToken }),
      saveRegistration,
    });
    console.log(JSON.stringify(report, null, 2));
    if (!report.webhookMatches) process.exitCode = 1;
  } catch (error) {
    console.error(setupFailureMessage(error));
    process.exitCode = 1;
  }
}

// Importing this module in a test never starts a CLI or makes provider calls.
if (process.argv[1] && resolve(process.argv[1]) === resolve(process.cwd(), "scripts/bale-pay-setup.ts"))
  void main();
