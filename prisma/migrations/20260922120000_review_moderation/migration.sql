-- ────────────────────────────────────────────────────────────────────────────
-- Review moderation (docs/REVIEW-MODERATION.md)
-- ────────────────────────────────────────────────────────────────────────────
-- `Review` has carried `status` / `aiFlags` / `moderatedById` / `moderatedAt`
-- since the schema was first written, but nothing ever wrote them: every
-- submitted review published itself immediately and every rating counted toward
-- the worker's average. This migration adds the missing audit trail so a
-- moderation decision is attributable and reviewable:
--
--   • ReviewModeration — append-only: one row per decision, carrying the admin
--     who made it, the reason on a rejection, and the triage signals seen at
--     decision time (so a later dispute can be judged against what the queue
--     actually showed).
--
-- No backfill: pre-existing Review rows have status = PENDING (the schema
-- default). The read paths treat those as unpublished until an admin works the
-- queue — exactly the backlog the admin queue exists to clear — while the demo
-- dataset (which has no status column of its own) is treated as already
-- approved so seeded profiles keep their ratings.

CREATE TABLE "ReviewModeration" (
  "id"        TEXT NOT NULL,
  "reviewId"  TEXT NOT NULL,
  "workerId"  TEXT NOT NULL,
  "action"    TEXT NOT NULL,
  "reason"    TEXT,
  "note"      TEXT,
  "flags"     JSONB,
  "actorId"   TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewModeration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReviewModeration_reviewId_idx" ON "ReviewModeration"("reviewId");
CREATE INDEX "ReviewModeration_workerId_idx" ON "ReviewModeration"("workerId");
CREATE INDEX "ReviewModeration_createdAt_idx" ON "ReviewModeration"("createdAt");

ALTER TABLE "ReviewModeration"
  ADD CONSTRAINT "ReviewModeration_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
