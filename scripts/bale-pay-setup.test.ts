// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { baleWebhookUrl, type BaleConfig } from "../src/platform/bale-config";
import { BaleSetupError, parseSetupMode, runBaleSetup, setupFailureMessage } from "./bale-pay-setup";

// Only local fixtures. No HTTP request, application database or real credential.
const config: BaleConfig = {
  enabled: false,
  botToken: "123456789:fixture_bot_token",
  providerToken: "WALLET-fixture_provider_token",
  botUsername: "Homanets_bot",
  webhookSecret: "a".repeat(64),
  origin: "https://homanets.test",
  accountFingerprint: "b".repeat(64),
  configFingerprint: "c".repeat(64),
};
const expected = baleWebhookUrl(config);

function fixture(url = expected) {
  return {
    api: {
      getMe: vi.fn(async () => ({ id: 123456789, username: "homanets_BOT", is_bot: true as const })),
      getWebhookInfo: vi.fn(async () => ({ url })),
      setWebhook: vi.fn(async (_url: string) => true as const),
    },
    saveRegistration: vi.fn(async (_fingerprint: string) => {}),
  };
}

describe("Bale setup ownership and registration", () => {
  it("checks the expected bot while payments are disabled and never writes", async () => {
    const dependencies = fixture();
    const report = await runBaleSetup("check", config, dependencies);
    expect(report).toEqual({
      bot: "@Homanets_bot",
      configurationValid: true,
      enabledSetting: false,
      botVerified: true,
      webhookPresent: true,
      webhookMatches: true,
      registrationSaved: false,
      readOnly: true,
    });
    expect(dependencies.api.setWebhook).not.toHaveBeenCalled();
    expect(dependencies.saveRegistration).not.toHaveBeenCalled();
    const printed = JSON.stringify(report);
    for (const privateValue of [config.botToken, config.providerToken, config.webhookSecret, expected, config.configFingerprint])
      expect(printed).not.toContain(privateValue);
  });

  it("reports an empty webhook during check without registering it", async () => {
    const dependencies = fixture("");
    expect(await runBaleSetup("check", config, dependencies)).toMatchObject({
      webhookPresent: false,
      webhookMatches: false,
      registrationSaved: false,
    });
    expect(dependencies.api.setWebhook).not.toHaveBeenCalled();
    expect(dependencies.saveRegistration).not.toHaveBeenCalled();
  });

  it("registers an empty webhook and saves only after its URL is observed", async () => {
    const dependencies = fixture("");
    dependencies.api.getWebhookInfo.mockResolvedValueOnce({ url: "" }).mockResolvedValueOnce({ url: expected });
    expect(await runBaleSetup("register", config, dependencies)).toMatchObject({
      webhookMatches: true,
      registrationSaved: true,
      readOnly: false,
    });
    expect(dependencies.api.setWebhook).toHaveBeenCalledTimes(1);
    expect(dependencies.api.setWebhook).toHaveBeenCalledWith(expected);
    expect(dependencies.saveRegistration).toHaveBeenCalledTimes(1);
    expect(dependencies.saveRegistration).toHaveBeenCalledWith(config.configFingerprint);
    const observedHookCall = dependencies.api.getWebhookInfo.mock.invocationCallOrder[1];
    expect(dependencies.saveRegistration.mock.invocationCallOrder[0]).toBeGreaterThan(observedHookCall);
  });

  it("records an existing matching webhook without setting it again", async () => {
    const dependencies = fixture();
    const report = await runBaleSetup("register", config, dependencies);
    expect(report.registrationSaved).toBe(true);
    expect(dependencies.api.getWebhookInfo).toHaveBeenCalledTimes(2);
    expect(dependencies.api.setWebhook).not.toHaveBeenCalled();
    expect(dependencies.saveRegistration).toHaveBeenCalledTimes(1);
    expect(dependencies.saveRegistration).toHaveBeenCalledWith(config.configFingerprint);
  });

  it("refuses to replace another integration's webhook", async () => {
    const dependencies = fixture("https://old-integration.test/private-hook");
    await expect(runBaleSetup("register", config, dependencies)).rejects.toMatchObject({ code: "existing_webhook_conflict" });
    expect(dependencies.api.setWebhook).not.toHaveBeenCalled();
    expect(dependencies.saveRegistration).not.toHaveBeenCalled();
  });

  it("does not touch the webhook when the token belongs to a different bot", async () => {
    const dependencies = fixture("");
    dependencies.api.getMe.mockResolvedValue({ id: 999, username: "different_bot", is_bot: true });
    await expect(runBaleSetup("register", config, dependencies)).rejects.toMatchObject({ code: "unexpected_bot" });
    expect(dependencies.api.getWebhookInfo).not.toHaveBeenCalled();
    expect(dependencies.api.setWebhook).not.toHaveBeenCalled();
    expect(dependencies.saveRegistration).not.toHaveBeenCalled();
  });

  it("does not save registration from a successful setter alone", async () => {
    const dependencies = fixture("");
    await expect(runBaleSetup("register", config, dependencies)).rejects.toMatchObject({ code: "webhook_registration_unconfirmed" });
    expect(dependencies.api.setWebhook).toHaveBeenCalledTimes(1);
    expect(dependencies.saveRegistration).not.toHaveBeenCalled();
  });

  it("does not register a hook that changes between the two observations", async () => {
    const dependencies = fixture();
    dependencies.api.getWebhookInfo.mockResolvedValueOnce({ url: expected }).mockResolvedValueOnce({ url: "https://other.test/hook" });
    await expect(runBaleSetup("register", config, dependencies)).rejects.toMatchObject({ code: "webhook_registration_unconfirmed" });
    expect(dependencies.api.setWebhook).not.toHaveBeenCalled();
    expect(dependencies.saveRegistration).not.toHaveBeenCalled();
  });

  it("rejects incomplete or test-wallet configuration before making provider calls", async () => {
    for (const invalid of [{ ...config, webhookSecret: "" }, { ...config, providerToken: "WALLET-TEST-fixture" }]) {
      const dependencies = fixture();
      await expect(runBaleSetup("check", invalid, dependencies)).rejects.toMatchObject({ code: "configuration_incomplete" });
      expect(dependencies.api.getMe).not.toHaveBeenCalled();
      expect(dependencies.saveRegistration).not.toHaveBeenCalled();
    }
  });

  it("uses a fixed safe failure when the registration store fails", async () => {
    const dependencies = fixture();
    dependencies.saveRegistration.mockRejectedValue(new Error("private database details " + config.botToken));
    await expect(runBaleSetup("register", config, dependencies)).rejects.toMatchObject({ code: "registration_save_failed" });
    expect(setupFailureMessage(new BaleSetupError("registration_save_failed"))).not.toContain(config.botToken);
  });

  it("never formats raw upstream errors or credential-bearing URLs", () => {
    const raw = new Error("provider description: " + config.botToken + " " + expected);
    const printed = setupFailureMessage(raw);
    expect(printed).not.toContain(raw.message);
    expect(printed).not.toContain(config.botToken);
    expect(printed).not.toContain(config.webhookSecret);
    expect(printed).not.toContain(expected);
  });

  it("requires the explicit register flag and rejects ambiguous or credential arguments", () => {
    expect(parseSetupMode([])).toBe("check");
    expect(parseSetupMode(["--check"])).toBe("check");
    expect(parseSetupMode(["--register"])).toBe("register");
    expect(parseSetupMode(["--help"])).toBe("help");
    for (const args of [["--force"], ["--check", "--register"], ["--register", config.botToken]])
      expect(() => parseSetupMode(args)).toThrow("invalid_arguments");
  });
});
