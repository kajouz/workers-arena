-- AlterTable
-- ActivityLog.actorId becomes a genuine FK to User.id (ON DELETE SET NULL: an
-- audit row survives the actor's deletion; the reference just clears).
--
-- Defensive backfill + cleanup for rows written by earlier versions:
--   1. Those rows stored the actor's DISPLAY NAME in actorId ("System",
--      "Platform Admin", …) and meta had NO `actor` field (the old prismaLog
--      didn't write one). Backfill meta.actor from actorId FIRST so the actor
--      identity survives the null-out below — otherwise every legacy row would
--      display as "System" forever (rowToActivityEntry falls back to
--      meta.actor ?? row.actorId ?? "System").
--   2. Null out actorId values that aren't real user ids so the FK constraint
--      can be added without failing. User.id is a PK (never NULL), so NOT IN
--      is safe here.
UPDATE "ActivityLog"
SET "meta" = jsonb_set(COALESCE("meta", '{}'::jsonb), '{actor}', to_jsonb("actorId"))
WHERE "actorId" IS NOT NULL
  AND "actorId" NOT IN (SELECT "id" FROM "User");

UPDATE "ActivityLog" SET "actorId" = NULL
WHERE "actorId" IS NOT NULL
  AND "actorId" NOT IN (SELECT "id" FROM "User");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
