/** Branded transactional email: one table-based layout with inline styles so
 * it renders the same in Gmail, Outlook and phone mail apps. Every piece of
 * text is escaped; callers pass plain strings, never HTML. */
export type EmailContent = {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  code?: string;
  button?: { label: string; url: string };
  note?: string;
  /** A short numbered list, e.g. first steps after joining. */
  steps?: { title: string; items: string[] };
  /** Newsletter only: a one-click unsubscribe link in the footer. */
  unsubscribe?: { label: string; url: string };
};
export type EmailBrand = { name: string; origin: string; supportEmail?: string; direction: "rtl" | "ltr"; footer: string[] };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const NAVY = "#293241",
  BLUE = "#3c5b81",
  ORANGE = "#ed6a4d",
  PAPER = "#efeae5",
  ICE = "#e4f4f7",
  MUTED = "#5b6573";

export function renderEmail(c: EmailContent, b: EmailBrand) {
  const align = b.direction === "rtl" ? "right" : "left";
  const font = "Vazirmatn,Tahoma,'Segoe UI',Arial,sans-serif";
  const origin = b.origin.replace(/\/$/, "");
  const p = c.paragraphs
    .map((t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.9;color:${NAVY};">${esc(t)}</p>`)
    .join("");
  const code = c.code
    ? `<div style="margin:22px 0;text-align:center;"><div dir="ltr" style="display:inline-block;padding:16px 28px;border-radius:14px;background:${ICE};border:1px dashed ${BLUE};font-family:'Courier New',monospace;font-size:34px;letter-spacing:10px;font-weight:700;color:${NAVY};">${esc(c.code)}</div></div>`
    : "";
  const button = c.button
    ? `<div style="margin:24px 0;text-align:center;"><a href="${esc(c.button.url)}" style="display:inline-block;padding:13px 30px;border-radius:999px;background:${ORANGE};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;">${esc(c.button.label)}</a></div>`
    : "";
  const steps = c.steps
    ? `<div style="margin:22px 0 4px;"><p style="margin:0 0 10px;font-size:15px;font-weight:700;color:${NAVY};">${esc(c.steps.title)}</p>${c.steps.items
        .map(
          (t, i) =>
            `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 10px;"><tr><td style="vertical-align:top;"><span style="display:inline-block;width:26px;height:26px;line-height:26px;border-radius:50%;background:${ORANGE};color:#fff;font-weight:700;font-size:13px;text-align:center;">${(i + 1).toLocaleString(b.direction === "rtl" ? "fa-IR" : "en-US")}</span></td><td style="padding:0 10px;font-size:14px;line-height:1.9;color:${NAVY};">${esc(t)}</td></tr></table>`,
        )
        .join("")}</div>`
    : "";
  const note = c.note
    ? `<p style="margin:18px 0 0;padding:12px 14px;border-radius:10px;background:${PAPER};font-size:13px;line-height:1.8;color:${MUTED};">${esc(c.note)}</p>`
    : "";
  const footer = b.footer.map((t) => esc(t)).join("<br>");
  const html = `<!doctype html>
<html lang="${b.direction === "rtl" ? "fa" : "en"}" dir="${b.direction}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PAPER};padding:28px 12px;font-family:${font};">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 6px 24px rgba(41,50,65,.08);" dir="${b.direction}">
<tr><td style="background:${NAVY};padding:22px 28px;text-align:${align};">
<a href="${esc(origin)}" style="text-decoration:none;color:#ffffff;">
<img src="${esc(origin)}/assets/brand-mark.png" width="44" height="44" alt="" style="vertical-align:middle;border-radius:10px;background:#ffffff;padding:3px;">
<span style="vertical-align:middle;font-size:20px;font-weight:700;margin:0 10px;">${esc(b.name)}</span></a>
</td></tr>
<tr><td style="height:4px;background:${ORANGE};line-height:4px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:30px 28px 26px;text-align:${align};">
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.6;color:${BLUE};">${esc(c.heading)}</h1>
${p}${code}${button}${steps}${note}
</td></tr>
<tr><td style="padding:18px 28px 24px;border-top:1px solid #ece6df;text-align:${align};font-size:12px;line-height:1.9;color:${MUTED};">
${footer}${b.supportEmail ? `<br><a href="mailto:${esc(b.supportEmail)}" style="color:${BLUE};">${esc(b.supportEmail)}</a>` : ""}
<br><a href="${esc(origin)}" style="color:${BLUE};">${esc(origin.replace(/^https?:\/\//, ""))}</a>${c.unsubscribe ? `<br><a href="${esc(c.unsubscribe.url)}" style="color:${MUTED};text-decoration:underline;">${esc(c.unsubscribe.label)}</a>` : ""}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  const text = [
    c.heading,
    "",
    ...c.paragraphs,
    ...(c.code ? ["", c.code, ""] : []),
    ...(c.button ? [c.button.label + ": " + c.button.url] : []),
    ...(c.steps ? ["", c.steps.title, ...c.steps.items.map((t, i) => `${i + 1}. ${t}`)] : []),
    ...(c.note ? ["", c.note] : []),
    "",
    "—",
    b.name,
    ...b.footer,
    origin,
    ...(c.unsubscribe ? [c.unsubscribe.label + ": " + c.unsubscribe.url] : []),
  ].join("\n");
  return { subject: c.subject, html, text };
}

/** "Brand <address>" when the address is plain; left alone if already named. */
export function senderAddress(name: string, address: string) {
  if (address.includes("<")) return address;
  const safe = name.replace(/["<>\r\n]/g, "").trim();
  return safe ? `"${safe}" <${address}>` : address;
}
