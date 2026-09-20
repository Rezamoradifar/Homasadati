import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { ApiError } from "../server/http";
import type { Row } from "./schema";
export async function invoice(order: Row, user: Row) {
  const doc = new PDFDocument({ size: "A4", margin: 45 });
  const buffers: Buffer[] = [];
  const finished = new Promise<Buffer>((res, rej) => {
    doc.on("data", (b) => buffers.push(b));
    doc.on("end", () => res(Buffer.concat(buffers)));
    doc.on("error", rej);
  });
  doc.fontSize(22).text("HOMAY SAADAT");
  doc.fontSize(12).text("Invoice / TOMAN", 45, 90);
  doc.moveDown();
  for (const [key, value] of Object.entries({
    Invoice: order.id,
    Date: order.created_at,
    Status: order.status,
    Quantity: order.quantity,
    "Unit price (Toman)": order.unit_price,
    "Total (Toman)": order.amount,
    "Payment method": order.payment_method,
    "Payment reference": order.payment_ref,
  }))
    doc.text(`${key}: ${value}`).moveDown(0.5);
  // An embedded Unicode font keeps customer names and titles in the downloadable PDF.
  const font = resolve(
    "node_modules/@fontsource/vazirmatn/files/vazirmatn-arabic-400-normal.woff",
  );
  if (existsSync(font)) {
    doc
      .font(font)
      .fontSize(14)
      .text(user.name, { align: "right", features: ["rtla"] })
      .text(order.title, { align: "right", features: ["rtla"] });
  }
  doc.end();
  const buffer = await finished;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${order.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
function safe(value: unknown) {
  const v = String(value ?? "");
  return /^[=+@\-\t\r]/.test(v) ? "'" + v : v;
}
export async function exportReport(report: Row, format: string) {
  const sets: Record<string, Row[]> = {
    sales: report.byVertical,
    trend: report.trend,
    members: [report.members],
    referrals: [{ ...report.referred, conversion: report.referralConversion }],
    subscriptions: [
      { ...report.subscriptions, churn: report.subscriptionChurn },
    ],
  };
  if (format === "xlsx") {
    const book = new ExcelJS.Workbook();
    for (const [name, rows] of Object.entries(sets)) {
      const sheet = book.addWorksheet(name);
      if (rows.length) {
        sheet.columns = Object.keys(rows[0]).map((key) => ({
          header: key,
          key,
          width: 24,
        }));
        rows.forEach((row) => sheet.addRow(row));
      }
    }
    const buffer = await book.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="homay-report.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  }
  if (format !== "csv") throw new ApiError(400, "invalid_input");
  const lines: string[] = [];
  for (const [name, rows] of Object.entries(sets)) {
    lines.push(name);
    if (rows.length) {
      lines.push(Object.keys(rows[0]).join(","));
      for (const row of rows)
        lines.push(
          Object.values(row)
            .map((v) => '"' + safe(v).replaceAll('"', '""') + '"')
            .join(","),
        );
    }
    lines.push("");
  }
  return new Response("\ufeff" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="homay-report.csv"',
      "Cache-Control": "no-store",
    },
  });
}
