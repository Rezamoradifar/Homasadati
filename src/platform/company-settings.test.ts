import { expect, it } from "vitest";
import { companySettingRules as rules } from "./validation";

it("normalises and checks the company details shown for trust review", () => {
  expect(rules.site_landline.parse("۰۲۱-۱۲۳۴۵۶۷۸")).toBe("02112345678");
  expect(rules.site_landline.safeParse("09121234567").success).toBe(false); // a mobile is not a landline
  expect(rules.site_postal_code.parse("۱۲۳۴۵ ۶۷۸۹۰")).toBe("1234567890");
  expect(rules.company_national_id.safeParse("1400123456").success).toBe(false);
  expect(rules.enamad_id.parse("123456")).toBe("123456");
  expect(rules.enamad_code.safeParse('x"><script>').success).toBe(false);
});
