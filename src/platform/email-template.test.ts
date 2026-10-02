// @vitest-environment node
import { expect, it } from "vitest";
import { renderEmail, senderAddress } from "./email-template";

it("renders escaped, branded HTML with a plain-text twin and a named sender", () => {
  const mail = renderEmail(
    { subject: "کد", preheader: "p", heading: "<b>سلام</b>", paragraphs: ["a & b"], code: "123456", button: { label: "ورود", url: "https://homanets.com/account" } },
    { name: "هما نت", origin: "https://homanets.com/", direction: "rtl", footer: ["هما نت"] },
  );
  expect(mail.html).toContain('dir="rtl"');
  expect(mail.html).toContain("&lt;b&gt;سلام&lt;/b&gt;");
  expect(mail.html).toContain("a &amp; b");
  expect(mail.html).toContain("https://homanets.com/assets/brand-mark.png");
  expect(mail.text).toContain("123456");
  expect(mail.text).toContain("ورود: https://homanets.com/account");
  expect(senderAddress("هما نت", "no-reply@homanets.com")).toBe('"هما نت" <no-reply@homanets.com>');
  expect(senderAddress("x", "Team <a@b.c>")).toBe("Team <a@b.c>");
});
