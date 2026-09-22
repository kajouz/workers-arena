"use server";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * REVIEW MODERATION ACTIONS (admin queue)
 * ────────────────────────────────────────────────────────────────────────────
 * The only writer of a review's published state. Guarded like every other admin
 * action: no session or a non-admin session is refused, and the decision is
 * attributed to the acting admin (the audit trail plus the worker's "your
 * review is live" notification both name them).
 *
 * `revalidatePath` on the admin queue and the worker's public profile so a
 * decision is visible immediately instead of after a cache window — the profile
 * is a prerendered shell, so a stale render here would look like the decision
 * was ignored.
 */

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth-demo";
import { decideReview } from "@/lib/data/review-moderation-store";
import { REVIEW_REJECTION_REASONS, type ReviewRejectionReason } from "@/lib/data/review-moderation";

export type ReviewDecisionState = { ok: boolean; error?: "unauthorized" | "invalid" | "not-found" | "conflict" };

export async function decideReviewAction(input: {
  reviewId: string;
  approve: boolean;
  reason?: string;
  note?: string;
}): Promise<ReviewDecisionState> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "unauthorized" };
  if (!input.reviewId) return { ok: false, error: "invalid" };

  const reason = input.reason?.trim();
  // A rejection must say why: the reason is what the audit row and the worker's
  // appeal both rest on, and the enum is the shared vocabulary with the panel.
  if (!input.approve && reason && !(REVIEW_REJECTION_REASONS as readonly string[]).includes(reason)) {
    return { ok: false, error: "invalid" };
  }
  if (!input.approve && !reason) return { ok: false, error: "invalid" };

  const decided = await decideReview({
    reviewId: input.reviewId,
    approve: input.approve,
    ...(reason ? { reason: reason as ReviewRejectionReason } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    actorId: session.id,
  });
  // null means unknown OR already decided — the queue re-read distinguishes
  // them for the admin, so this reports the conflict rather than guessing.
  if (!decided) return { ok: false, error: "conflict" };

  revalidatePath("/admin/reviews");
  revalidatePath("/admin");
  revalidatePath(`/workers/${decided.workerSlug}`);
  return { ok: true };
}
