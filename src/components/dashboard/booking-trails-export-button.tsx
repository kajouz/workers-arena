"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";
import { toast } from "@/components/ui/toast";
import { exportBookingTrailsAction } from "@/app/actions/bookings";
import { readAuditDocLocale } from "@/lib/data/booking-print";

/**
 * §2.4 admin trails export (docs/ENHANCEMENT-PLAN.md §2.4) — the CSV/PDF
 * export of EVERY booking's event trail, mirroring the per-booking print
 * view. Renders in the admin dashboard's booking-funnel card header; the
 * server action (admin-only) builds the flat CSV table or the combined audit
 * PDF (renderBookingTrailsPrint → renderAuditPdf) and this button downloads
 * the result with a localized success/error toast.
 */

/** Trigger a client-side download from a Blob payload. */
function downloadBlob(data: BlobPart, type: string, filename: string): void {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function BookingTrailsExportButton() {
  const { locale, t } = useLocale();
  const [busy, setBusy] = useState<null | "csv" | "pdf">(null);

  const run = async (format: "csv" | "pdf") => {
    if (busy) return;
    setBusy(format);
    // The audit-document language: the remembered preference (shared with the
    // print/email dialogs via wa_print_locale), falling back to the current
    // page locale — so the exported PDF/CSV doesn't always follow the page
    // locale. Read at click time so a change made elsewhere is picked up.
    const docLocale = readAuditDocLocale(locale);
    const res = await exportBookingTrailsAction(format, docLocale);
    setBusy(null);
    const date = new Date().toISOString().slice(0, 10);
    const countLabel = t("admin.exportTrailsDone").replace("{count}", String(res.count ?? 0));

    if (res.ok) {
      if (format === "csv" && res.csv) {
        downloadBlob(res.csv, "text/csv;charset=utf-8", `booking-audit-trails-${date}.csv`);
      } else if (format === "pdf" && res.pdfBase64) {
        const bytes = Uint8Array.from(atob(res.pdfBase64), (c) => c.charCodeAt(0));
        downloadBlob(bytes, "application/pdf", `booking-audit-trails-${date}.pdf`);
      } else {
        return; // defensive: ok without payload
      }
      toast("success", countLabel);
      return;
    }

    const message =
      res.error === "no-data"
        ? t("admin.exportTrailsNoData")
        : res.error === "render-failed"
          ? t("admin.exportTrailsRenderFailed")
          : t("admin.exportTrailsFailed");
    toast("error", message);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy !== null}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          {t("admin.exportTrails")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("admin.exportTrails")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy !== null} onClick={() => run("csv")}>
          <FileSpreadsheet className="size-4 text-emerald-600 dark:text-emerald-400" />
          {t("admin.exportTrailsCsv")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy !== null} onClick={() => run("pdf")}>
          <FileText className="size-4 text-red-600 dark:text-red-400" />
          {t("admin.exportTrailsPdf")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
