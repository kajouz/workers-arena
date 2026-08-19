/**
 * CSV and PDF export utilities
 */

/**
 * Export data to CSV file
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  columns: { key: keyof T; label: string }[],
  filename: string
): void {
  // Create header row
  const headers = columns.map((col) => col.label);

  // Create data rows
  const rows = data.map((item) =>
    columns.map((col) => {
      const value = item[col.key];
      // Escape quotes and wrap in quotes if contains comma or newline
      if (typeof value === "string" && (value.includes(",") || value.includes("\n"))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return String(value ?? "");
    })
  );

  // Combine headers and rows
  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

  // Create and download file
  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${filename}.csv`);
}

/**
 * Export data to JSON file
 */
export function exportToJSON<T>(data: T[], filename: string): void {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json" });
  downloadBlob(blob, `${filename}.json`);
}

/**
 * Export data to PDF (simple text-based)
 */
export function exportToPDF<T extends Record<string, any>>(
  data: T[],
  columns: { key: keyof T; label: string }[],
  title: string,
  filename: string
): void {
  // Create HTML content
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    h1 { font-size: 24px; margin-bottom: 10px; }
    .subtitle { color: #666; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f3f4f6; font-weight: bold; }
    tr:nth-child(even) { background-color: #f9fafb; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="subtitle">Generated on ${new Date().toLocaleDateString()}</p>
  <table>
    <thead>
      <tr>
        ${columns.map((col) => `<th>${col.label}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${data
        .map(
          (item) => `
        <tr>
          ${columns.map((col) => `<td>${item[col.key] ?? ""}</td>`).join("")}
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>
  <p class="footer">WorkersArena - ${data.length} records</p>
</body>
</html>
  `;

  // Open in new window for printing
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  }
}

/**
 * Helper to download a blob
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format data for export (handle dates, objects, etc.)
 */
export function formatForExport<T extends Record<string, any>>(
  data: T[],
  formatters?: Partial<Record<keyof T, (value: any) => string>>
): T[] {
  return data.map((item) => {
    const formatted = { ...item };

    if (formatters) {
      Object.entries(formatters).forEach(([key, formatter]) => {
        if (formatter) {
          formatted[key as keyof T] = formatter(item[key]) as any;
        }
      });
    }

    // Default date formatting
    Object.keys(formatted).forEach((key) => {
      const value = formatted[key as keyof T];
      if (value && typeof value === "object" && "getTime" in value) {
        formatted[key as keyof T] = (value as Date).toLocaleDateString() as any;
      }
    });

    return formatted;
  });
}

/**
 * Export component props
 */
export interface ExportButtonProps {
  data: any[];
  columns: { key: string; label: string }[];
  filename: string;
  title?: string;
  formats?: ("csv" | "json" | "pdf")[];
}
