import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/documents — list documents
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const plotId = searchParams.get("plotId");
  const jobId = searchParams.get("jobId");

  // Build where clause based on filters
  let where: Record<string, unknown> = { siteId: id };

  if (jobId) {
    where = { siteId: id, jobId };
  } else if (plotId) {
    // Include plot-level docs AND job-level docs for jobs in this plot
    const plotJobs = await prisma.job.findMany({
      where: { plotId },
      select: { id: true },
    });
    const jobIds = plotJobs.map((j) => j.id);
    where = {
      siteId: id,
      OR: [{ plotId }, ...(jobIds.length > 0 ? [{ jobId: { in: jobIds } }] : [])],
    };
  }

  const documents = await prisma.siteDocument.findMany({
    where,
    include: {
      uploadedBy: { select: { id: true, name: true } },
      plot: { select: { id: true, name: true, plotNumber: true } },
      job: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(documents);
}

// POST /api/sites/[id]/documents — upload a document
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const name = (formData.get("name") as string) || file?.name;
  const plotId = formData.get("plotId") as string | null;
  let jobId = formData.get("jobId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // 10MB limit
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  // If jobId provided, get the plotId from the job
  let resolvedPlotId = plotId;
  if (jobId && !plotId) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { plotId: true },
    });
    resolvedPlotId = job?.plotId || null;
  }

  const ext = file.name.split(".").pop() || "bin";
  const storagePath = `documents/${id}/${resolvedPlotId || "site"}/${jobId || "general"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await getSupabase()
    .storage.from(PHOTOS_BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = getSupabase().storage.from(PHOTOS_BUCKET).getPublicUrl(storagePath);

  const doc = await prisma.siteDocument.create({
    data: {
      name: name || file.name,
      url: publicUrl,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      siteId: id,
      plotId: resolvedPlotId || null,
      jobId: jobId || null,
      uploadedById: session.user.id,
    },
    include: {
      uploadedBy: { select: { id: true, name: true } },
      plot: { select: { id: true, name: true, plotNumber: true } },
      job: { select: { id: true, name: true } },
    },
  });

  await prisma.eventLog.create({
    data: {
      type: "USER_ACTION",
      description: `Document "${doc.name}" uploaded${doc.plot ? ` to ${doc.plot.plotNumber ? `Plot ${doc.plot.plotNumber}` : doc.plot.name}` : ""}`,
      siteId: id,
      plotId: plotId || null,
      jobId: jobId || null,
      userId: session.user.id,
    },
  });

  return NextResponse.json(doc, { status: 201 });
}
