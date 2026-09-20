import {registrationSchema,referralCode,memberDetailsSchema} from "./registration-model";
import { cartItemsSchema, checkoutSchema } from "./cart-validation";
import { z } from "zod";
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
  if (p[0] === "auth") {
    if (p[1] === "otp")
      schema = z.object({
        target: contact,
        purpose: z.enum(["register", "login", "reset", "contact"]),
      });
    if (p[1] === "register")
      schema = registrationSchema;
    if (p[1] === "login")
      schema = z
        .object({
          target: contact,
          password: z.string().min(1).max(128).optional(),
          challenge: id.optional(),
          code: otp.optional(),
          totp: otp.optional(),
        })
        .refine((v) => v.password || (v.challenge && v.code));
    if (p[1] === "reset")
      schema = z.object({
        target: contact,
        password,
        challenge: id,
        code: otp,
        totp: otp.optional(),
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
      iban,
      idempotencyKey: id,
      totp: otp.optional(),
    });
  if(p[0]=== "referrals")schema=z.object({code:referralCode});
  if(p[0]=== "member-details")schema=memberDetailsSchema;
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
    schema = z.object({ target: contact, challenge: id, code: otp, password });
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
  if (p[0] === "security")
    schema = z
      .object({
        action: z.enum([
          "password",
          "revoke",
          "totp-setup",
          "totp-enable",
          "totp-disable",
        ]),
        currentPassword: password,
        newPassword: password.optional(),
        code: z.string().max(6).optional(),
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
                "email_from",
                "kavenegar_key",
                "sms_template",
                "sms_sender",
                "zarinpal_merchant",
                "site_name",
                "site_logo",
                "site_contact",
              ]),
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
  if (!schema) return data;
  return schema.parse(data);
}
