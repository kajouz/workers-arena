import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import {
  generateWorkerDigestHTML,
  generateCustomerDigestHTML,
  fetchSponsoredContentForEmail,
  sendDigestEmail,
} from "@/lib/email/digest";

/**
 * Weekly digest cron job.
 * 
 * Sends weekly booking summary emails to workers and customers
 * with sponsored content sections.
 * 
 * Call this via: POST /api/cron/digest
 * Or schedule via: Vercel Cron (vercel.json) or external cron service
 */
export async function POST(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  if (process.env.LOG_LEVEL !== "silent") console.log("[Digest Cron] Starting weekly digest send...");

  // In production, fetch recipients from database
  // For now, log that the job ran
  const results = {
    workersSent: 0,
    customersSent: 0,
    errors: 0,
  };

  // Example: Fetch sponsored content for emails
  const sponsoredContent = await fetchSponsoredContentForEmail("emailDigest", "en");

  // In production, you would:
  // 1. Fetch all active workers and customers from the database
  // 2. For each recipient, generate their personalized digest
  // 3. Include sponsored content in each email
  // 4. Send the email via the configured provider

  if (process.env.LOG_LEVEL !== "silent") {
    console.log("[Digest Cron] Sponsored content ready:", sponsoredContent.length, "ads");
    console.log("[Digest Cron] Results:", results);
  }

  return NextResponse.json({
    success: true,
    message: "Weekly digest cron executed",
    results,
    sponsoredAdsIncluded: sponsoredContent.length,
  });
}

/**
 * GET handler — also cron-guarded (no open leak).
 */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return NextResponse.json({
    message: "Digest cron endpoint is ready",
    usage: "POST /api/cron/digest with Authorization: Bearer <CRON_SECRET> or x-cron-secret",
  });
}
