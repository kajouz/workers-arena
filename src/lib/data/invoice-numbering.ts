/**
 * Race-free WA-YYYY-NNNNN invoice numbers (docs/PAYMENTS.md §Invoices).
 *
 * The old scheme derived the next number from `count()+1` of this year's rows,
 * so two confirms in flight could compute the same number: booking and campaign
 * confirms retried on the unique clash, the subscription confirm did not and
 * left an active plan with no invoice. The counter row is now claimed with ONE
 * atomic statement — INSERT … ON CONFLICT DO UPDATE … RETURNING — so every
 * caller gets a distinct number with no retry loop. The first claim of a year
 * seeds the counter from the highest number already issued, so numbering
 * continues the existing sequence instead of restarting at 1.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { formatInvoiceNumber } from "./types";

type Db = Prisma.TransactionClient | PrismaClient;

/** Claim the next invoice number for `year` (defaults to the current year). */
export async function claimInvoiceNumber(db: Db, year: number = new Date().getFullYear()): Promise<string> {
  const prefix = `WA-${year}-`;
  const from = prefix.length + 1;
  const rows = await db.$queryRaw<Array<{ last: number }>>`
    INSERT INTO "InvoiceCounter" ("year", "last")
    VALUES (
      ${year}::int,
      COALESCE(
        (SELECT MAX(CAST(SUBSTRING("number" FROM ${from}::int) AS INTEGER))
           FROM "Invoice"
          WHERE "number" LIKE ${prefix + "%"}
            AND SUBSTRING("number" FROM ${from}::int) ~ '^[0-9]+$'),
        0
      ) + 1
    )
    ON CONFLICT ("year") DO UPDATE SET "last" = "InvoiceCounter"."last" + 1
    RETURNING "last"`;
  const last = Number(rows[0]?.last);
  if (!Number.isFinite(last) || last <= 0) throw new Error("[invoice-numbering] counter claim returned no row");
  return formatInvoiceNumber(year, last);
}
