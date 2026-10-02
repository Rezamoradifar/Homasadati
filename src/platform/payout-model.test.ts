// @vitest-environment node
import { expect, it } from "vitest";
import { payoutProfileSchema } from "./payout-model";
import { bankCard, nationalId } from "./validation";

it("accepts Persian digits and separators and rejects bad check digits", () => {
  expect(nationalId.parse("۰۰۱۲۳۴۵۶۷۹")).toBe("0012345679");
  expect(nationalId.safeParse("0012345678").success).toBe(false);
  expect(nationalId.safeParse("1111111111").success).toBe(false);
  expect(bankCard.parse("6037 9912 3456 7893")).toBe("6037991234567893");
  expect(bankCard.safeParse("6037991234567894").success).toBe(false);
  expect(
    payoutProfileSchema.safeParse({
      holderName: "لیلا آزمون",
      nationalId: "0012345679",
      cardNumber: "6037991234567893",
      iban: "IR06 2960 0000 0010 0324 2000 01",
    }).success,
  ).toBe(true);
});
