import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

// (May 2026 audit #1) Helper used by every method on this route.
async function authoriseJob(jobId: string, session: { user: { id: string; role?: string } }) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      name: true,
      plotId: true,
      plot: { select: { siteId: true } },
    },
  });
  if (!job) return { error: NextResponse.json({ error: "Job not found" }, { status: 404 }) };
  if (
    !(await canAccessSite(
      session.user.id,
      session.user.role ?? "",
      job.plot.siteId,
    ))
  ) {
    return {
      error: NextResponse.json(
        { error: "You do not have access to this site" },
        { status: 403 },
      ),
    };
  }
  return { job };
}

// GET /api/jobs/[id]/contractors — list contractors on a job
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await authoriseJob(id, session);
  if ("error" in result) return result.error;

  const contractors = await prisma.jobContractor.findMany({
    where: { jobId: id },
    include: {
      contact: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(contractors);
}

// PUT /api/jobs/[id]/contractors — replace all contractor assignments
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { contactIds } = body as { contactIds: string[] };

  if (!Array.isArray(contactIds)) {
    return NextResponse.json(
      { error: "contactIds must be an array" },
      { status: 400 }
    );
  }

  // Verify job + caller's site access in one check
  const result = await authoriseJob(id, session);
  if ("error" in result) return result.error;
  const job = result.job;

  // Fetch contractor names for the log description
  const contacts = contactIds.length > 0
    ? await prisma.contact.findMany({
        where: { id: { in: contactIds } },
        select: { name: true, company: true },
      })
    : [];
  const contractorNames = contacts.map((c) => c.company || c.name).join(", ");

  try {
    // Replace all assignments in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Delete existing assignments
      await tx.jobContractor.deleteMany({ where: { jobId: id } });

      // Create new assignments
      if (contactIds.length > 0) {
        await tx.jobContractor.createMany({
          data: contactIds.map((contactId) => ({
            jobId: id,
            contactId,
          })),
        });
      }

      // Log event with contractor names
      const desc = contactIds.length === 0
        ? `All contractors removed from "${job.name}"`
        : `Contractor${contacts.length > 1 ? "s" : ""} assigned to "${job.name}": ${contractorNames}`;
      await tx.eventLog.create({
        data: {
          type: "JOB_EDITED",
          description: desc,
          siteId: job.plot.siteId,
          plotId: job.plotId,
          jobId: id,
          userId: session.user.id,
        },
      });

      return tx.jobContractor.findMany({
        where: { jobId: id },
        include: { contact: true },
        orderBy: { createdAt: "asc" },
      });
    },
    // (May 2026 audit #81) Bumped to 30s — replacing many contractor
    // assignments at once was hitting the default 5s.
    { timeout: 30_000, maxWait: 10_000 },
    );

    return NextResponse.json(result);
  } catch (err) {
    return apiError(err, "Failed to update contractor assignments");
  }
}
