import {
  ticketCreateSchema,
  ticketReplySchema,
  ticketReviewSchema,
  ticketCloseSchema,
  binaryScheduleUpdateSchema,
  merchantReviewSchema,
} from "./operations-model";
import { binaryRulesSchema, simulationSchema } from "./network-rules-model";
import { loyaltyPolicySchema, loyaltyLevelSchema } from "./loyalty-model";
import { accessRoleSchema, accessAssignmentSchema } from "./access-model";
import {
  merchantContractSchema,
  merchantProductSchema,
  merchantPaymentSchema,
  merchantFulfillmentSchema,
} from "./merchant-model";
import {
  merchantSchema,
  pointsAdjustmentSchema,
  rewardSchema,
  redeemSchema,
  redemptionReviewSchema,
} from "./club-model";
import {
  travelRuleSchema,
  travelCalendarSchema,
  travelRequestSchema,
  travelReviewSchema,
} from "./travel-model";
import {
  registrationSchema,
  referralCode,
  memberDetailsSchema,
  verifyEmailSchema,
  captchaToken,
} from "./registration-model";
import { cartItemsSchema, checkoutSchema } from "./cart-validation";
import { z } from "zod";
import { payoutProfileSchema } from "./payout-model";
import { nationalId, iranMobile } from "./validation";
import {
  id,
  text,
  contact,
  password,
  iban,
  money,
  productSchema,
  policySchema,
  httpsImage,
  companySettingRules,
  companySettingKeys,
  role,
  vertical,
} from "./validation";
const otp = z.string().regex(/^\d{6}$/);
const reason = z.object({ reason: text });
// The same primitive schemas are used by server handlers. Authorization and
// database-dependent limits are always rechecked on the server.
export function validateClient(path: string, method: string, data: unknown) {
  const p = path.split("?")[0].split("/");
  let schema: z.ZodTypeAny | undefined;
  if (p.join("/") === "cart/quote")
    schema = z.object({ items: cartItemsSchema });
  if (p[0] === "checkouts" && !p[1]) schema = checkoutSchema;
  if (path === "admin/travel/rules") schema = travelRuleSchema;
  if (path === "admin/travel/calendar") schema = travelCalendarSchema;
  if (path === "admin/travel/review") schema = travelReviewSchema;
  if (path === "travel-cards/requests") schema = travelRequestSchema;
  if (path === "travel-cards/cancel") schema = z.object({ id, reason: text });
  if (p[0] === "auth") {
    if (p[1] === "otp")
      schema = z.union([
        z.object({
          target: contact,
          purpose: z.enum(["register", "login", "reset", "contact"]),
          captchaToken,
        }),
        z.object({ purpose: z.literal("reset"), nationalId, mobile: iranMobile, captchaToken }),
      ]);
    if (p[1] === "verify-email") schema = verifyEmailSchema;
    if (p[1] === "register") schema = registrationSchema;
    if (p[1] === "login")
      schema = z
        .object({
          target: contact,
          adminPasswordLogin: z.boolean().optional(),
          password: z.string().min(1).max(128).optional(),
          challenge: id.optional(),
          code: otp.optional(),
          totp: otp.optional(),
          recoveryCode: z.string().max(30).optional(),
          captchaToken,
        })
        .refine((v) => v.password || (v.challenge && v.code));
    if (p[1] === "reset")
      schema = z.object({
        target: contact.optional(),
        nationalId: nationalId.optional(),
        mobile: iranMobile.optional(),
        password,
        challenge: id,
        code: otp,
        totp: otp.optional(),
        recoveryCode: z.string().max(30).optional(),
        captchaToken,
      });
  }
  if (p[0] === "orders") {
    if (!p[1])
      schema = z.object({
        productId: id,
        quantity: z.number().int().min(1).max(100),
        method: z.enum(["wallet", "zarinpal"]),
        idempotencyKey: id,
      });
    else {
      id.parse(p[1]);
      if (p[2] === "cancel")
        schema = z.object({ walletRefundConsent: z.literal(true) });
    }
  }
  if (p[0] === "withdrawals")
    schema = z.object({
      amount: money,
      idempotencyKey: id,
      totp: otp.optional(),
    });
  if (p[0] === "payout-profile") schema = payoutProfileSchema;
  if (p[0] === "referral") schema = z.object({ code: referralCode });
  if (p[0] === "referrals") schema = z.object({ code: referralCode });
  if (p[0] === "member-details") schema = memberDetailsSchema;
  if (p[0] === "profile")
    schema = z.object({
      name: text,
      preferences: z.object({
        email: z.boolean(),
        sms: z.boolean(),
        inApp: z.boolean(),
      }),
    });
  if (p[0] === "contact")
    schema = z.object({
      target: contact,
      challenge: id,
      code: otp,
      password,
      totp: otp.optional(),
    });
  if (p[0] === "wishlist") {
    if (method === "DELETE") id.parse(p[1]);
    else schema = z.object({ productId: id });
  }
  if (p[0] === "addresses") {
    if (method === "DELETE") id.parse(p[1]);
    else
      schema = z.object({
        id: id.optional(),
        label: text,
        country: text,
        city: text,
        postal_code: z.string().min(3).max(30),
        address: z.string().trim().min(5).max(1000),
      });
  }
  if (p[0] === "subscriptions") schema = z.object({ id });
  if (p[0] === "notifications")
    schema = z
      .object({ id: id.optional(), all: z.boolean().optional() })
      .refine((v) => v.id || v.all === true);
  if (p[0] === "security" && !p[1])
    schema = z
      .object({
        action: z.enum([
          "password",
          "revoke",
          "totp-setup",
          "totp-enable",
          "totp-disable",
          "google-unlink",
          "recovery-regenerate",
        ]),
        currentPassword: z.string().max(128).optional(),
        emailChallenge: id.optional(),
        emailCode: otp.optional(),
        newPassword: password.optional(),
        code: z.string().max(6).optional(),
        recoveryCode: z.string().max(30).optional(),
      })
      .refine((v) => v.action !== "password" || !!v.newPassword);
  if (p[0] === "admin") {
    if (method === "DELETE") {
      id.parse(p[2]);
      schema = reason;
    } else
      switch (p[1]) {
        case "products":
          schema = productSchema;
          break;
        case "policy":
          schema = z.object({ policy: policySchema, reason: text });
          break;
        case "payout-profiles":
          schema = z.object({
            userId: id,
            status: z.enum(["verified", "rejected"]),
            reason: z.string().trim().max(500).default(""),
          });
          break;
        case "withdrawals":
          schema = z
            .object({
              id,
              status: z.enum(["approved", "rejected", "paid"]),
              reason: text,
              reference: z.string().trim().min(3).max(200).optional(),
            })
            .refine((v) => v.status !== "paid" || !!v.reference);
          break;
        case "orders":
          schema = z.object({
            id,
            action: z.enum(["processing", "shipped", "delivered", "refund"]),
            reason: text,
          });
          break;
        case "users":
          schema = z.object({
            id,
            role: role.optional(),
            blocked: z.boolean().optional(),
            reason: text,
          });
          break;
        case "network":
          schema = z
            .object({
              id,
              sponsor: id.nullable(),
              parent: id.nullable(),
              leg: z.enum(["left", "right"]).nullable(),
              reason: text,
            })
            .refine((v) => !!v.parent === !!v.leg);
          break;
        case "ranks":
          schema = z.object({
            id: id.optional(),
            name: text,
            personal_threshold: z.number().int().min(0).max(1e12),
            group_threshold: z.number().int().min(0).max(1e12),
            bonus_bps: z.number().int().min(0).max(10000),
          });
          break;
        case "missions":
          schema = z.object({
            id: id.optional(),
            title: text,
            metric: z.enum([
              "personal_sales",
              "group_sales",
              "referrals",
              "orders",
            ]),
            target: money,
            active: z.boolean(),
          });
          break;
        case "taxonomy":
          schema = z.object({
            id: id.optional(),
            name: text,
            kind: z.enum(["category", "tag"]),
            vertical,
          });
          break;
        case "content":
          schema = z.object({
            id: id.optional(),
            kind: z.enum(["blog", "banner", "page"]),
            slug: z.string().regex(/^[a-z0-9-]{1,100}$/),
            title: text,
            body: z.string().min(1).max(12000),
            image: httpsImage,
            published: z.boolean(),
          });
          break;
        case "flags":
          schema = z.object({ id, reason: text });
          break;
        case "settings":
          schema = z
            .object({
              key: z.enum([
                "resend_key",
                "turnstile_site_key",
                "turnstile_secret_key",
                "referral_requires_purchase",
                "email_from",
                "kavenegar_key",
                "sms_template",
                "sms_sender",
                "zarinpal_merchant",
                "site_name",
                "site_logo",
                "site_contact",
                "site_email",
                "site_ceo_name",
                "google_client_id",
                "fx_source_url",
                "fx_source_path",
                "fx_source_unit",
                "fx_usd_manual",
                ...companySettingKeys,
              ] as [string, ...string[]]),
              value: z.string().trim().min(1).max(2000),
              reason: text,
            })
            .superRefine((v, c) => {
              if (
                v.key === "email_from" &&
                !z.string().email().safeParse(v.value).success
              )
                c.addIssue({
                  code: "custom",
                  message: "ایمیل فرستنده معتبر نیست",
                });
              const company = companySettingRules[v.key]?.safeParse(v.value);
              if (company && !company.success)
                c.addIssue({ code: "custom", message: company.error.issues[0].message });
              if (
                v.key === "site_logo" &&
                !httpsImage.safeParse(v.value).success
              )
                c.addIssue({
                  code: "custom",
                  message: "نشانی تصویر معتبر نیست",
                });
            });
          break;
      }
  }
  if (path === "admin/merchants") schema = merchantSchema;
  if (path === "admin/loyalty") schema = pointsAdjustmentSchema;
  if (path === "admin/rewards") schema = rewardSchema;
  if (path === "admin/redemptions") schema = redemptionReviewSchema;
  if (path === "loyalty/redeem") schema = redeemSchema;
  if (path === "admin/binary-rules")
    schema = z.object({ rules: binaryRulesSchema, reason: text });
  if (path === "admin/binary-simulate") schema = simulationSchema;
  if (path === "admin/loyalty-policy")
    schema = z.object({ policy: loyaltyPolicySchema, reason: text });
  if (path === "admin/loyalty-levels") schema = loyaltyLevelSchema;
  if (path === "admin/access") schema = accessRoleSchema;
  if (path === "admin/access/assign") schema = accessAssignmentSchema;
  if (path === "admin/merchant-operations") schema = merchantContractSchema;
  if (path === "admin/merchant-operations/products")
    schema = merchantProductSchema;
  if (path === "admin/merchant-settlements") schema = merchantPaymentSchema;
  if (path === "merchant/orders") schema = merchantFulfillmentSchema;
  if (path === "loyalty/cancel") schema = z.object({ id, reason: text });
  if (path === "admin/binary-schedule") schema = binaryScheduleUpdateSchema;
  if (path === "admin/merchant-settlements/review")
    schema = merchantReviewSchema;
  if (p[0] === "tickets" || (p[0] === "admin" && p[1] === "tickets")) {
    const staff = p[0] === "admin",
      rest = p.slice(staff ? 2 : 1);
    if (!rest.length && !staff) schema = ticketCreateSchema;
    if (rest.length === 1 && method === "PATCH")
      schema = staff ? ticketReviewSchema : ticketCloseSchema;
    if (rest.length === 2 && rest[1] === "replies") schema = ticketReplySchema;
  }
  if (!schema) return data;
  return schema.parse(data);
}
