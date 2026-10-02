/**
 * CSV rendering of the money audit trail (PaymentAuditEvent). Pure — the
 * route reads the rows, this turns them into a spreadsheet. Every cell is
 * quoted and formula-leading characters are neutralised, so a value typed
 * into a note can never execute as a spreadsheet formula.
 */
import type { PaymentAuditEvent } from "./payment-workflow-store";

const HEADER = ["time", "action", "payment", "reference", "amount_usd", "actor", "receipt", "txn", "detail"];

function cell(value: unknown): string {
  let s = value === undefined || value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function paymentAuditCsv(rows: PaymentAuditEvent[]): string {
  const lines = [HEADER.join(",")];
  for (const e of rows) {
    const d = e.detail ?? {};
    lines.push(
      [
        e.createdAt,
        e.action,
        e.paymentId ?? "",
        e.reference ?? "",
        e.amountMinor !== undefined ? (e.amountMinor / 100).toFixed(2) : "",
        e.actorName ?? "",
        "hadReceipt" in d ? (d.hadReceipt ? "yes" : "NO") : "",
        typeof d.txn === "string" ? d.txn : "",
        JSON.stringify(d),
      ]
        .map(cell)
        .join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}
