/** Verifies the trigram migration is live: wa_norm() works and the fuzzy
 * candidate query returns rows. Run: node scripts/check-trigram.mjs */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
try {
  const norm = await db.$queryRaw`SELECT wa_norm('أحمد السبّاكُ 123!') AS norm`;
  console.log("wa_norm →", norm[0].norm);

  const cats = await db.$queryRaw`SELECT "nameEn", wa_norm("nameEn") AS norm FROM "Category" WHERE "slug" = 'plumbing' LIMIT 1`;
  console.log("category plumbing norm →", cats[0]?.norm);

  const candidates = await db.$queryRaw`
    SELECT DISTINCT w."id" FROM "Worker" w
    LEFT JOIN "Category" c ON c."id" = w."categoryId"
    LEFT JOIN "City" ci ON ci."id" = w."cityId"
    LEFT JOIN "Area" ar ON ar."id" = w."areaId"
    LEFT JOIN "ServiceItem" s ON s."workerId" = w."id"
    WHERE wa_norm(w."nameEn") ILIKE ${"%plumb%"} OR wa_norm(w."nameAr") ILIKE ${"%سباك%"}
       OR word_similarity(${"plumbng"}, wa_norm(c."nameEn")) > 0.55
       OR word_similarity(${"سباك"}, wa_norm(c."nameAr")) > 0.55
    LIMIT 10`;
  console.log("fuzzy candidates (typo 'plumbng' / Arabic 'سباك') →", candidates.length, "worker(s)");
  if (candidates.length === 0) process.exitCode = 1;
} catch (err) {
  console.error("TRIGRAM CHECK FAILED:", err.message ?? err);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
