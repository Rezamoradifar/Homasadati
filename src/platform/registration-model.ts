import { z } from "zod";
import { id, password, text, contact } from "./validation";
export const registrationEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);
export const registrationContact = z.union([
  registrationEmail,
  contact.refine((v) => !v.includes("@")),
]);
export const captchaToken = z.string().max(2048).optional();
export const verifyEmailSchema = z
  .object({
    target: registrationContact,
    challenge: id,
    code: z.string().regex(/^\d{6}$/),
    captchaToken,
  })
  .strict();
export const TERMS_VERSION = "2026-09-20-v1";
export const referralCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{4,40}$/, "کد معرف معتبر نیست");
export const memberDetailsSchema = z
  .object({
    firstName: text,
    lastName: text,
    country: text,
    city: text,
    occupation: z.string().trim().max(120).default(""),
    language: z.enum(["fa", "en", "ar"]).default("fa"),
    interests: z
      .array(z.enum(["tourism", "craft", "beauty", "ai", "leather"]))
      .max(5)
      .default([]),
  })
  .strict();
export const registrationSchema = z
  .object({
    target: registrationContact,
    // Both optional: the verified email code is enough to open an account.
    // A password or an authenticator can be added later from the account;
    // the authenticator is required before the first withdrawal.
    password: password.optional(),
    verificationToken: z.string().regex(/^[a-f0-9]{64}$/),
    totp: z.string().regex(/^\d{6}$/).optional(),
    captchaToken,
    invitationMode: z.enum(["with-code", "without-code"]),
    referral: z.union([z.literal(""), referralCode]).optional(),
    details: memberDetailsSchema,
    termsAccepted: z.literal(true),
    privacyAccepted: z.literal(true),
    adultConfirmed: z.literal(true),
    termsVersion: z.literal(TERMS_VERSION),
    marketingConsent: z.boolean().default(false),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.invitationMode === "with-code" && !d.referral)
      ctx.addIssue({
        code: "custom",
        path: ["referral"],
        message: "کد دعوت را وارد کنید.",
      });
    if (d.invitationMode === "without-code" && d.referral)
      ctx.addIssue({
        code: "custom",
        path: ["referral"],
        message: "مسیر ثبت‌نام و کد دعوت هماهنگ نیست.",
      });
  });
