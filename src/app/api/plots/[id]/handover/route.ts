import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerCurrentDate } from "@/lib/dev-date";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { loadJsPdf, pdfResponse } from "@/lib/pdf-builder";
import { getBranding } from "@/lib/branding";
import { loadPdfBrand, drawBrandFooter, brandHeadFill } from "@/lib/pdf-branding";
import { logEvent } from "@/lib/event-log";
import { jobStatusLabel, titleCaseEnum, HANDOVER_DOC_TYPE_LABELS } from "@/lib/labels";

async function guardPlotAccess(plotId: string, userId: string, role: string) {
  const plot = await prisma.plot.findUnique({ where: { id: plotId }, select: { siteId: true } });
  if (!plot) return { status: 404, body: { error: "Plot not found" } };
  const ok = await canAccessSite(userId, role, plot.siteId);
  if (!ok) return { status: 403, body: { error: "You do not have access to this site" } };
  return null;
}

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
  const guard = await guardPlotAccess(id, session.user.id, (session.user as { role: string }).role);
  if (guard) return NextResponse.json(guard.body, { status: guard.status });

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
    try {
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
    } catch (err) {
      return apiError(err, "Failed to update handover");
    }
  }

  const total = items.length;
  const checked = items.filter((i) => i.checkedAt).length;
  const required = items.filter((i) => i.required).length;
  const requiredChecked = items.filter((i) => i.required && i.checkedAt).length;

  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id,
      docType: i.docType,
      label: HANDOVER_DOC_TYPE_LABELS[i.docType] || i.docType,
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

  // Verify the checklist item belongs to a plot the caller can access
  const item = await prisma.handoverChecklist.findUnique({
    where: { id: itemId },
    select: { plot: { select: { siteId: true } } },
  });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  const role = (session.user as { role: string }).role;
  if (!(await canAccessSite(session.user.id, role, item.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
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

  try {
    const updated = await prisma.handoverChecklist.update({
      where: { id: itemId },
      data: updateData,
    });

    // (May 2026 Story pass) HANDOVER_COMPLETED milestone — when ticking
    // this item leaves no unchecked items on the plot, log it once
    // (findFirst guard keeps it idempotent if items are re-ticked).
    if (checked === true) {
      const remaining = await prisma.handoverChecklist.count({
        where: { plotId: updated.plotId, checkedAt: null },
      });
      if (remaining === 0) {
        const already = await prisma.eventLog.findFirst({
          where: { plotId: updated.plotId, type: "HANDOVER_COMPLETED" },
          select: { id: true },
        });
        if (!already) {
          await logEvent(prisma, {
            type: "HANDOVER_COMPLETED",
            description:
              "Handover checklist completed — every item signed off",
            plotId: updated.plotId,
            userId: session.user.id,
            detail: { plotId: updated.plotId },
          });
        }
      }
    }

    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err, "Failed to update handover");
  }
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

  // (Jun 2026 white-label) Resolve the customer branding once — the buyer
  // handover pack is the most customer-facing PDF in the system, so it heads
  // with the customer logo + business name and carries the "Powered by Sight
  // Manager" co-brand (plus a support-contact line) on every page.
  const brand = await loadPdfBrand((await getBranding()).customer);
  const headFill = brandHeadFill(brand);

  // Build PDF using canonical pdf-builder
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF();

  // --- Cover Page ---
  // (Jun 2026 white-label) Customer logo centred above the title (when one is
  // set + embeddable). Scaled to an 18mm-high box, max 70mm wide, centred on
  // the A4 page (width 210mm). Fail-safe: a missing/unsupported logo just
  // drops the image and the title sits where it always did.
  if (brand.logoDataUrl) {
    try {
      const props = doc.getImageProperties(brand.logoDataUrl);
      const h = 18;
      const w = Math.min(70, h * (props.width / props.height));
      doc.addImage(brand.logoDataUrl, props.fileType || "PNG", 105 - w / 2, 28, w, h);
    } catch {
      /* logo embed failed — cover still renders without it */
    }
  }

  doc.setFontSize(24);
  doc.text("Handover Pack", 105, 60, { align: "center" });

  // Issuing business name (the customer brand) under the title.
  doc.setFontSize(12);
  doc.setTextColor(71, 85, 105);
  doc.text(brand.brandName, 105, 70, { align: "center" });
  doc.setTextColor(0);

  doc.setFontSize(14);
  doc.text(plot.site.name, 105, 84, { align: "center" });
  doc.text(
    `Plot ${plot.plotNumber || ""} — ${plot.name}`,
    105,
    94,
    { align: "center" }
  );
  if (plot.houseType) {
    doc.setFontSize(11);
    doc.text(`House Type: ${plot.houseType}`, 105, 104, { align: "center" });
  }
  if (plot.site.address) {
    doc.setFontSize(10);
    doc.text(plot.site.address, 105, 116, { align: "center" });
  }
  doc.setFontSize(10);
  doc.text(
    `Generated: ${getServerCurrentDate(req).toLocaleDateString("en-GB")}`,
    105,
    134,
    { align: "center" }
  );
  // (Jun 2026 white-label) "Questions?" support line on the cover so the buyer
  // knows who to contact — only when a support email is configured.
  if (brand.supportEmail) {
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(`Questions? ${brand.supportEmail}`, 105, 144, { align: "center" });
    doc.setTextColor(0);
  }
  // Co-brand footer on the cover page.
  drawBrandFooter(doc, brand);

  // --- Document Checklist ---
  doc.addPage();
  drawBrandFooter(doc, brand);
  doc.setFontSize(16);
  doc.text("Document Checklist", 14, 20);

  autoTable(doc, {
    startY: 28,
    head: [["Document", "Required", "Status", "Checked By"]],
    body: checklist.map((item) => [
      HANDOVER_DOC_TYPE_LABELS[item.docType] || item.docType,
      item.required ? "Yes" : "No",
      item.checkedAt ? "Complete" : item.document ? "Linked" : "Missing",
      item.checkedBy?.name || "—",
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: headFill },
  });

  // --- Job Summary ---
  doc.addPage();
  drawBrandFooter(doc, brand);
  doc.setFontSize(16);
  doc.text("Job Summary", 14, 20);

  autoTable(doc, {
    startY: 28,
    head: [["Job", "Status", "Signed Off By"]],
    body: plot.jobs.map((j) => [
      j.name,
      jobStatusLabel(j.status),
      j.signedOffBy?.name || "—",
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: headFill },
  });

  // --- Open Snags ---
  if (plot.snags.length > 0) {
    doc.addPage();
    drawBrandFooter(doc, brand);
    doc.setFontSize(16);
    doc.text("Outstanding Snags", 14, 20);

    autoTable(doc, {
      startY: 28,
      head: [["Description", "Location", "Priority", "Status"]],
      body: plot.snags.map((s) => [
        s.description,
        s.location || "—",
        titleCaseEnum(s.priority),
        titleCaseEnum(s.status),
      ]),
      // (Jun 2026 white-label) Outstanding-snags head keeps a red accent —
      // it flags risk, so it shouldn't be tinted with the brand colour.
      styles: { fontSize: 9 },
      headStyles: { fillColor: [220, 38, 38] },
    });
  }

  return pdfResponse(doc, `handover-${plot.plotNumber || plot.name}.pdf`);
}
