import { loadEnvConfig } from "@next/env";
import { ApiError } from "../src/server/http";
import { checkDigiPayAuthentication, DigiPayError } from "../src/platform/digipay";

const errors = new Set(["digipay_not_configured", "digipay_sandbox_forbidden", "digipay_timeout", "digipay_unavailable", "digipay_authentication_failed", "digipay_invalid_response"]);
const oauthErrors = new Set(["invalid_grant", "unauthorized_client", "invalid_client", "unsupported_grant_type", "invalid_request", "access_denied"]);

async function main() {
  try {
    loadEnvConfig(process.cwd(), undefined, { info() {}, error() {} });
    const result = await checkDigiPayAuthentication();
    console.log(JSON.stringify({ authenticated: result.authenticated, environment: result.environment,
      expiresInSeconds: result.expiresInSeconds, purchaseAttempted: false }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      authenticated: false,
      errorCode: error instanceof ApiError && errors.has(error.code) ? error.code : "diagnostic_failed",
      httpStatus: error instanceof DigiPayError && Number.isInteger(error.httpStatus) && error.httpStatus! >= 100 && error.httpStatus! <= 599 ? error.httpStatus : undefined,
      oauthError: error instanceof DigiPayError && error.oauthError && oauthErrors.has(error.oauthError) ? error.oauthError : undefined,
      purchaseAttempted: false,
    }, null, 2));
    process.exitCode = 2;
  }
}

void main();
