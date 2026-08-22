import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import {
  createReferralCode,
  getReferralCode,
  getReferralStats,
  getUserReferrals,
  applyReferralCode,
  getShareUrls,
} from "@/lib/referral/referral";

/**
 * GET /api/referral — Get current user's referral code, stats, and referrals
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get or create referral code
  let code = getReferralCode(session.id);
  if (!code) {
    code = createReferralCode(session.id, session.name, session.role === "worker" ? "worker" : "customer");
  }

  const stats = getReferralStats(session.id);
  const referrals = getUserReferrals(session.id);
  const shareUrls = getShareUrls(code.code, session.name);

  return NextResponse.json({
    code: code.code,
    stats,
    referrals,
    shareUrls,
  });
}

/**
 * POST /api/referral — Apply a referral code
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { code } = body;

  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Referral code required" }, { status: 400 });
  }

  const result = applyReferralCode(code, session.id, session.name, session.email);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    referrerName: result.referrerName,
  });
}
