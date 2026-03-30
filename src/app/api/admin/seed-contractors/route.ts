import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/seed-contractors
 * Assigns existing CONTRACTOR contacts to every job across all sites, round-robin.
 * Safe to re-run — skips already-assigned pairs.
 */
export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get all contractor contacts
  const contacts = await prisma.contact.findMany({
    where: { type: "CONTRACTOR" },
    select: { id: true, name: true, company: true },
  });

  if (contacts.length === 0) {
    return NextResponse.json({ error: "No contractor contacts found. Create some contractors first." }, { status: 400 });
  }

  // Get all jobs
  const jobs = await prisma.job.findMany({
    select: { id: true, name: true },
  });

  // Get existing assignments to avoid duplicates
  const existing = await prisma.jobContractor.findMany({
    select: { jobId: true, contactId: true },
  });
  const existingSet = new Set(existing.map((e) => `${e.jobId}:${e.contactId}`));

  // Assign round-robin: each job gets 1 contractor
  const toCreate: { jobId: string; contactId: string }[] = [];
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const contact = contacts[i % contacts.length];
    const key = `${job.id}:${contact.id}`;
    if (!existingSet.has(key)) {
      toCreate.push({ jobId: job.id, contactId: contact.id });
    }
  }

  if (toCreate.length > 0) {
    await prisma.jobContractor.createMany({ data: toCreate, skipDuplicates: true });
  }

  return NextResponse.json({
    success: true,
    contractorsUsed: contacts.length,
    jobsTotal: jobs.length,
    assignmentsCreated: toCreate.length,
    assignmentsSkipped: jobs.length - toCreate.length,
    contractors: contacts.map((c) => c.company || c.name),
  });
}
