-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "owner_user_id" UUID;

-- CreateIndex
CREATE INDEX "companies_owner_user_id_idx" ON "companies"("owner_user_id");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: existing companies had no owner. Assign each to the recruiter
-- whose profile was linked to it earliest, which for data created through
-- PATCH /profiles/me is the recruiter who first registered the company.
-- Companies with no linked recruiter stay ownerless.
UPDATE "companies" c
SET "owner_user_id" = first_recruiter."user_id"
FROM (
    SELECT DISTINCT ON ("company_id") "company_id", "user_id"
    FROM "recruiter_profiles"
    WHERE "company_id" IS NOT NULL
    ORDER BY "company_id", "created_at" ASC, "id" ASC
) AS first_recruiter
WHERE c."id" = first_recruiter."company_id"
  AND c."owner_user_id" IS NULL;
