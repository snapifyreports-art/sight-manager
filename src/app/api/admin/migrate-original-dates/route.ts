import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * One-time migration: add originalStartDate/originalEndDate/awaitingRestart columns
 * and backfill original dates from current startDate/endDate.
 * Safe to call multiple times — idempotent.
 * GET /api/admin/migrate-original-dates
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Add columns if they don't exist (PostgreSQL idempotent)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Job"
        ADD COLUMN IF NOT EXISTS "originalStartDate" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "originalEndDate" TIMESTAMP(3);
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Plot"
        ADD COLUMN IF NOT EXISTS "awaitingRestart" BOOLEAN NOT NULL DEFAULT false;
    `);

    // Backfill: copy current startDate → originalStartDate (only where null)
    const { count: jobsUpdated } = await prisma.job.updateMany({
      where: { originalStartDate: null, startDate: { not: null } },
      data: {}, // We need raw SQL for this — Prisma doesn't support field-to-field copy
    });

    // Raw backfill for field-to-field copy
    await prisma.$executeRawUnsafe(`
      UPDATE "Job"
      SET "originalStartDate" = "startDate"
      WHERE "originalStartDate" IS NULL AND "startDate" IS NOT NULL;
    `);

    await prisma.$executeRawUnsafe(`
      UPDATE "Job"
      SET "originalEndDate" = "endDate"
      WHERE "originalEndDate" IS NULL AND "endDate" IS NOT NULL;
    `);

    // Count how many were backfilled
    const backfilled = await prisma.job.count({
      where: { originalStartDate: { not: null } },
    });

    return NextResponse.json({
      success: true,
      backfilledJobs: backfilled,
      message: "Migration complete. originalStartDate/originalEndDate backfilled from startDate/endDate.",
    });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
