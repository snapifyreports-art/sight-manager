/**
 * Apply the templates-feature schema additions via raw SQL on the pooled
 * connection. We use this because `prisma db push` requires the direct
 * (port 5432) connection which is intermittently unreachable from this
 * environment.
 *
 * Idempotent: every statement uses IF NOT EXISTS / DROP-and-recreate
 * patterns so a second run is a no-op.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1. PlotTemplate.isDraft
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "PlotTemplate"
    ADD COLUMN IF NOT EXISTS "isDraft" BOOLEAN NOT NULL DEFAULT false;
  `);

  // 2. Plot.sourceVariantId
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Plot"
    ADD COLUMN IF NOT EXISTS "sourceVariantId" TEXT;
  `);

  // 3. TemplateVariant
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TemplateVariant" (
      "id" TEXT PRIMARY KEY,
      "templateId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "TemplateVariant_template_fk"
        FOREIGN KEY ("templateId") REFERENCES "PlotTemplate"("id") ON DELETE CASCADE,
      CONSTRAINT "TemplateVariant_template_name_unique"
        UNIQUE ("templateId", "name")
    );
  `);

  // 4. TemplateVariantJobOverride
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TemplateVariantJobOverride" (
      "id" TEXT PRIMARY KEY,
      "variantId" TEXT NOT NULL,
      "templateJobId" TEXT NOT NULL,
      "durationDays" INTEGER,
      CONSTRAINT "TVJO_variant_fk"
        FOREIGN KEY ("variantId") REFERENCES "TemplateVariant"("id") ON DELETE CASCADE,
      CONSTRAINT "TVJO_job_fk"
        FOREIGN KEY ("templateJobId") REFERENCES "TemplateJob"("id") ON DELETE CASCADE,
      CONSTRAINT "TVJO_unique"
        UNIQUE ("variantId", "templateJobId")
    );
  `);

  // 5. TemplateVariantMaterialOverride
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TemplateVariantMaterialOverride" (
      "id" TEXT PRIMARY KEY,
      "variantId" TEXT NOT NULL,
      "templateMaterialId" TEXT NOT NULL,
      "quantity" DOUBLE PRECISION,
      "unitCost" DOUBLE PRECISION,
      CONSTRAINT "TVMO_variant_fk"
        FOREIGN KEY ("variantId") REFERENCES "TemplateVariant"("id") ON DELETE CASCADE,
      CONSTRAINT "TVMO_material_fk"
        FOREIGN KEY ("templateMaterialId") REFERENCES "TemplateMaterial"("id") ON DELETE CASCADE,
      CONSTRAINT "TVMO_unique"
        UNIQUE ("variantId", "templateMaterialId")
    );
  `);

  // 6. TemplateAuditEvent
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TemplateAuditEvent" (
      "id" TEXT PRIMARY KEY,
      "templateId" TEXT NOT NULL,
      "userId" TEXT,
      "userName" TEXT,
      "action" TEXT NOT NULL,
      "detail" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TemplateAuditEvent_template_fk"
        FOREIGN KEY ("templateId") REFERENCES "PlotTemplate"("id") ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "TemplateAuditEvent_template_createdAt_idx"
    ON "TemplateAuditEvent" ("templateId", "createdAt");
  `);

  // 7. TemplateMaterialConsumption
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TemplateMaterialConsumption" (
      "id" TEXT PRIMARY KEY,
      "templateMaterialId" TEXT NOT NULL,
      "plotId" TEXT NOT NULL,
      "jobId" TEXT,
      "quantity" DOUBLE PRECISION NOT NULL,
      "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TMC_material_fk"
        FOREIGN KEY ("templateMaterialId") REFERENCES "TemplateMaterial"("id") ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "TMC_material_loggedAt_idx"
    ON "TemplateMaterialConsumption" ("templateMaterialId", "loggedAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "TMC_plot_idx"
    ON "TemplateMaterialConsumption" ("plotId");
  `);

  // 8. TemplateDocument.isPlaceholder
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "TemplateDocument"
    ADD COLUMN IF NOT EXISTS "isPlaceholder" BOOLEAN NOT NULL DEFAULT false;
  `);

  // 8a. variantId on TemplateJob / TemplateMaterial / TemplateDocument
  // (full-fat variants rework, May 2026). Nullable — null means the row
  // belongs to the base template; non-null means it's owned by a variant.
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "TemplateJob"
    ADD COLUMN IF NOT EXISTS "variantId" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'TemplateJob_variant_fk'
      ) THEN
        ALTER TABLE "TemplateJob"
        ADD CONSTRAINT "TemplateJob_variant_fk"
        FOREIGN KEY ("variantId") REFERENCES "TemplateVariant"("id") ON DELETE CASCADE;
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "TemplateJob_template_variant_idx"
    ON "TemplateJob" ("templateId", "variantId");
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "TemplateMaterial"
    ADD COLUMN IF NOT EXISTS "variantId" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'TemplateMaterial_variant_fk'
      ) THEN
        ALTER TABLE "TemplateMaterial"
        ADD CONSTRAINT "TemplateMaterial_variant_fk"
        FOREIGN KEY ("variantId") REFERENCES "TemplateVariant"("id") ON DELETE CASCADE;
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "TemplateMaterial_template_variant_idx"
    ON "TemplateMaterial" ("templateId", "variantId");
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "TemplateDocument"
    ADD COLUMN IF NOT EXISTS "variantId" TEXT;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'TemplateDocument_variant_fk'
      ) THEN
        ALTER TABLE "TemplateDocument"
        ADD CONSTRAINT "TemplateDocument_variant_fk"
        FOREIGN KEY ("variantId") REFERENCES "TemplateVariant"("id") ON DELETE CASCADE;
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "TemplateDocument_template_variant_idx"
    ON "TemplateDocument" ("templateId", "variantId");
  `);

  // 9. Plot.sourceVariantId FK (separate so the column can exist on rows
  //    that pre-date the variant table without errors; only added after
  //    the table itself is in place).
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Plot_sourceVariant_fk'
      ) THEN
        ALTER TABLE "Plot"
        ADD CONSTRAINT "Plot_sourceVariant_fk"
        FOREIGN KEY ("sourceVariantId") REFERENCES "TemplateVariant"("id") ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  console.log("✓ schema additions applied");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
