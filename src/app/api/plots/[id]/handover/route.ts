import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerCurrentDate } from "@/lib/dev-date";

export const dynamic = "force-dynamic";

const STANDARD_DOC_TYPES = [
  "EPC",
  "GAS_SAFE_CERT",
  "ELECTRICAL_CERT",
  "WARRANTY",
  "NHBC_CERT",
  "BUILDING_REGS",
  "USER_MANUAL",
  "FLOOR_PLAN",
  "SNAGGING_SIGNOFF",
] as const;

const DOC_TYPE_LABELS: Record<string, string> = {
  EPC: "Energy Performance Certificate",
  GAS_SAFE_CERT: "Gas Safe Certificate",
  ELECTRICAL_CERT: "Electrical Installation Certificate",
  WARRANTY: "Warranty Documents",
  NHBC_CERT: "NHBC Certificate",
  BUILDING_REGS: "Building Regulations Approval",
  USER_MANUAL: "Appliance / User Manuals",
  FLOOR_PLAN: "Floor Plan",
  SNAGGING_SIGNOFF: "Snagging Sign-Off",
};

// GET /api/plots/[id]/handover — get or auto-create handover checklist
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Check existing items
  let items = await prisma.handoverChecklist.findMany({
    where: { plotId: id },
    include: {
      document: { select: { id: true, name: true, url: true, fileName: true } },
      checkedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Auto-create standard items if none exist
  if (items.length === 0) {
    await prisma.handoverChecklist.createMany({
      data: STANDARD_DOC_TYPES.map((docType) => ({
        plotId: id,
        docType,
        required: true,
      })),
    });
    items = await prisma.handoverChecklist.findMany({
      where: { plotId: id },
      include: {
        document: { select: { id: true, name: true, url: true, fileName: true } },
        checkedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  const total = items.length;
  const checked = items.filter((i) => i.checkedAt).length;
  const required = items.filter((i) => i.required).length;
  const requiredChecked = items.filter((i) => i.required && i.checkedAt).length;

  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id,
      docType: i.docType,
      label: DOC_TYPE_LABELS[i.docType] || i.docType,
      required: i.required,
      document: i.document,
      checkedAt: i.checkedAt?.toISOString() || null,
      checkedBy: i.checkedBy,
      notes: i.notes,
    })),
    summary: { total, checked, required, requiredChecked },
  });
}

// PATCH /api/plots/[id]/handover — update a checklist item
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await params; // consume params
  const body = await req.json();
  const { itemId, documentId, checked, notes } = body;

  if (!itemId) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};

  if (documentId !== undefined) {
    updateData.documentId = documentId || null;
  }
  if (notes !== undefined) {
    updateData.notes = notes || null;
  }
  if (checked === true) {
    updateData.checkedAt = getServerCurrentDate(req);
    updateData.checkedById = (session.user as { id: string }).id;
  } else if (checked === false) {
    updateData.checkedAt = null;
    updateData.checkedById = null;
  }

  const updated = await prisma.handoverChecklist.update({
    where: { id: itemId },
    data: updateData,
  });

  return NextResponse.json(updated);
}

// POST /api/plots/[id]/handover — generate handover PDF
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Gather all data in 2 batches (Supabase pool limit = 3)
  const [plot, checklist] = await Promise.all([
    prisma.plot.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        plotNumber: true,
        houseType: true,
        site: { select: { name: true, address: true } },
        jobs: {
          select: {
            name: true,
            status: true,
            signedOffBy: { select: { name: true } },
            signedOffAt: true,
          },
          orderBy: { sortOrder: "asc" },
        },
        snags: {
          where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
          select: {
            description: true,
            priority: true,
            status: true,
            location: true,
          },
        },
      },
    }),
    prisma.handoverChecklist.findMany({
      where: { plotId: id },
      include: {
        document: { select: { name: true } },
        checkedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!plot) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }

  // Build PDF using jsPDF
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();

  // --- Cover Page ---
  doc.setFontSize(24);
  doc.text("Handover Pack", 105, 60, { align: "center" });

  doc.setFontSize(14);
  doc.text(plot.site.name, 105, 80, { align: "center" });
  doc.text(
    `Plot ${plot.plotNumber || ""} — ${plot.name}`,
    105,
    90,
    { align: "center" }
  );
  if (plot.houseType) {
    doc.setFontSize(11);
    doc.text(`House Type: ${plot.houseType}`, 105, 100, { align: "center" });
  }
  if (plot.site.address) {
    doc.setFontSize(10);
    doc.text(plot.site.address, 105, 112, { align: "center" });
  }
  doc.setFontSize(10);
  doc.text(
    `Generated: ${getServerCurrentDate(req).toLocaleDateString("en-GB")}`,
    105,
    130,
    { align: "center" }
  );

  // --- Document Checklist ---
  doc.addPage();
  doc.setFontSize(16);
  doc.text("Document Checklist", 14, 20);

  autoTable(doc, {
    startY: 28,
    head: [["Document", "Required", "Status", "Checked By"]],
    body: checklist.map((item) => [
      DOC_TYPE_LABELS[item.docType] || item.docType,
      item.required ? "Yes" : "No",
      item.checkedAt ? "Complete" : item.document ? "Linked" : "Missing",
      item.checkedBy?.name || "—",
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
  });

  // --- Job Summary ---
  doc.addPage();
  doc.setFontSize(16);
  doc.text("Job Summary", 14, 20);

  autoTable(doc, {
    startY: 28,
    head: [["Job", "Status", "Signed Off By"]],
    body: plot.jobs.map((j) => [
      j.name,
      j.status.replace(/_/g, " "),
      j.signedOffBy?.name || "—",
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
  });

  // --- Open Snags ---
  if (plot.snags.length > 0) {
    doc.addPage();
    doc.setFontSize(16);
    doc.text("Outstanding Snags", 14, 20);

    autoTable(doc, {
      startY: 28,
      head: [["Description", "Location", "Priority", "Status"]],
      body: plot.snags.map((s) => [
        s.description,
        s.location || "—",
        s.priority,
        s.status.replace(/_/g, " "),
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [220, 38, 38] },
    });
  }

  const pdfBuffer = doc.output("arraybuffer");

  return new NextResponse(Buffer.from(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="handover-${plot.plotNumber || plot.name}.pdf"`,
    },
  });
}
