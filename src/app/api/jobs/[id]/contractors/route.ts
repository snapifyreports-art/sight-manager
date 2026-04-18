import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

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

  // Verify job exists
  const job = await prisma.job.findUnique({
    where: { id },
    include: { plot: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

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
    });

    return NextResponse.json(result);
  } catch (err) {
    return apiError(err, "Failed to update contractor assignments");
  }
}
