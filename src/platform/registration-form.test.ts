import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  normalizeRegistrationDigits,
  parseRegistrationTarget,
  registrationFormError,
} from "./registration-form";
import {
  memberDetailsSchema,
  registrationContact,
  registrationEmail,
  registrationSchema,
  TERMS_VERSION,
  verifyEmailSchema,
} from "./registration-model";

const details = {
  firstName: "عضو",
  lastName: "آزمون",
  country: "ایران",
  city: "شیراز",
};
const registration = {
  target: "member@example.test",
  verificationToken: "a".repeat(64),
  nationalId: "1234567891",
  mobile: "09121234567",
  invitationMode: "without-code",
  details,
  termsAccepted: true,
  privacyAccepted: true,
  adultConfirmed: true,
  termsVersion: TERMS_VERSION,
};

function validationError(schema: z.ZodTypeAny, value: unknown) {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
  if (result.success) throw new Error("Expected invalid test input");
  return result.error;
}

describe("registration contact input", () => {
  it("converts Persian and Arabic digits without stripping other input", () => {
    expect(normalizeRegistrationDigits("۰۱۲۳۴۵۶۷۸۹ ٠١٢٣٤٥٦٧٨٩"))
      .toBe("0123456789 0123456789");
    expect(normalizeRegistrationDigits(" +۹۸ (۹۱۲)-abc@example.test "))
      .toBe(" +98 (912)-abc@example.test ");
  });

  it.each([
    "09121234567",
    "۰۹۱۲۱۲۳۴۵۶۷",
    "٠٩١٢١٢٣٤٥٦٧",
    " ۰۹۱۲ ۱۲۳ ۴۵۶۷ ",
    "(0912)-123-4567",
    "+989121234567",
    "00989121234567",
    "۰۰۹۸ (۹۱۲) ۱۲۳-۴۵۶۷",
    "989121234567",
  ])("normalizes SMS input %s to the same server-valid contact", (input) => {
    const normalized = parseRegistrationTarget(input, "sms");
    expect(normalized).toBe("+989121234567");
    expect(registrationContact.parse(normalized)).toBe(normalized);
  });

  it("reproduces the original local-number failure and fixes it before shared validation", () => {
    expect(registrationContact.safeParse("۰۹۱۲۱۲۳۴۵۶۷").success).toBe(false);
    expect(registrationContact.safeParse("09121234567").success).toBe(false);
    expect(registrationContact.parse(parseRegistrationTarget("۰۹۱۲۱۲۳۴۵۶۷", "sms")))
      .toBe("+989121234567");
  });

  it("preserves supported international numbers and normalizes email independently", () => {
    expect(parseRegistrationTarget("+44 (7700) 900-123", "sms"))
      .toBe("+447700900123");
    expect(parseRegistrationTarget("  Member.Name@Example.TEST  ", "email"))
      .toBe("member.name@example.test");
    expect(() => parseRegistrationTarget("09121234567", "email")).toThrow();
  });

  it.each([
    "",
    "member@example.test",
    "0912123456",
    "091212345678",
    "08121234567",
    "+9809121234567",
    "+98912123456",
    "0912abc34567",
    "++989121234567",
    "0912/123/4567",
    "+1234567890123456",
  ])("does not turn malformed SMS input %s into an accepted contact", (input) => {
    expect(() => parseRegistrationTarget(input, "sms")).toThrow();
  });

  it("accepts normalized six-digit OTPs but does not discard invalid OTP characters", () => {
    const verification = {
      target: "member@example.test",
      challenge: "00000000-0000-4000-8000-000000000000",
    };
    expect(verifyEmailSchema.parse({
      ...verification,
      code: normalizeRegistrationDigits("۱۲٣۴۵٦"),
    }).code).toBe("123456");
    for (const input of ["۱۲۳۴۵", "۱۲۳۴۵۶۷", "۱۲۳-۴۵۶", "۱۲۳a۴۵۶"]) {
      expect(verifyEmailSchema.safeParse({
        ...verification,
        code: normalizeRegistrationDigits(input),
      }).success).toBe(false);
    }
  });
});

describe("actionable registration errors", () => {
  it.each([
    ["firstName", "نام"],
    ["lastName", "نام خانوادگی"],
    ["country", "کشور"],
    ["city", "شهر"],
  ])("identifies blank %s with its Persian label", (field, label) => {
    const error = validationError(memberDetailsSchema, { ...details, [field]: "   " });
    expect(registrationFormError(error, "email")).toMatchObject({
      field,
      message: expect.stringContaining(label),
    });
  });

  it("maps nested details to the form field and keeps the first failing field", () => {
    const error = validationError(registrationSchema, {
      ...registration,
      details: { ...details, country: "", city: "" },
    });
    expect(registrationFormError(error, "email")).toMatchObject({
      field: "country",
      message: expect.stringContaining("کشور"),
    });
  });

  it("uses the target context for a primitive email validation error", () => {
    const error = validationError(registrationEmail, "private-invalid-address");
    const result = registrationFormError(error, "email", "target");
    expect(result.field).toBe("target");
    expect(result.message).toContain("ایمیل");
    expect(result.message).not.toContain("private-invalid-address");
  });

  it("identifies an invalid OTP without showing its submitted value", () => {
    const error = validationError(verifyEmailSchema, {
      target: "member@example.test",
      challenge: "00000000-0000-4000-8000-000000000000",
      code: "invalid-private-code",
    });
    const result = registrationFormError(error, "sms");
    expect(result.field).toBe("code");
    expect(result.message).toContain("کد");
    expect(result.message).not.toContain("invalid-private-code");
  });

  it("asks to verify contact again for an invalid enrollment token without exposing it", () => {
    const token = "private-invalid-enrollment-token";
    const error = validationError(registrationSchema, {
      ...registration,
      verificationToken: token,
    });
    const result = registrationFormError(error, "email");
    expect(result.message).toContain("تأیید راه تماس");
    expect(result.message).toContain("دوباره");
    expect(result.message).not.toContain(token);
  });

  it("does not make occupation or referral mandatory for direct registration", () => {
    expect(registrationSchema.safeParse(registration).success).toBe(true);
    expect(registrationSchema.safeParse({
      ...registration,
      referral: "",
      details: { ...details, occupation: "" },
    }).success).toBe(true);
  });

  it("does not expose an unknown schema path or its raw diagnostic message", () => {
    const result = registrationFormError(new z.ZodError([{
      code: "custom",
      path: ["private-internal-field"],
      message: "private-validation-diagnostic",
    }]), "email");
    expect(result.field).toBeUndefined();
    expect(result.message).not.toContain("private-");
    expect(result.message).toMatch(/صفحه|دوباره/);
  });

  it("retains actionable API errors that are not schema validation failures", () => {
    const message = "ارسال پیامک موقتاً در دسترس نیست؛ دوباره تلاش کنید.";
    expect(registrationFormError(new Error(message), "sms").message).toBe(message);
  });
});
