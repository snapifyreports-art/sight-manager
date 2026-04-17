import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "UserSite" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
        "userId" TEXT NOT NULL,
        "siteId" TEXT NOT NULL,
        CONSTRAINT "UserSite_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "UserSite_userId_siteId_key" UNIQUE ("userId", "siteId"),
        CONSTRAINT "UserSite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
        CONSTRAINT "UserSite_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE
      )
    `);
    return NextResponse.json({ status: "ok", message: "UserSite table created" });
  } catch (e: unknown) {
    return NextResponse.json({ status: "error", error: String(e) });
  }
}
