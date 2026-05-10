import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #205) GET /api/snags/[id]/pdf
 *
 * Single-snag PDF export. Used by the snag detail dialog's "Download
 * PDF" action so a manager can attach the snag report to an email,
 * insurance claim, or contractor punch-list.
 *
 * Layout:
 *   - Header: snag description, status, priority chip
 *   - Body: plot/site/job, dates (raised, resolved), assignee,
 *           contractor, location, notes
 *   - Photos: thumbnails of every attached photo (excludes contractor
 *     close-out photos for confidentiality only when status=OPEN, but
 *     we always include them when generating the PDF since the user
 *     triggering it has site access)
 *   - Sign-off / resolution history if present
 *
 * Site-access guarded — returns 404 if the user can't see the snag.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const snag = await prisma.snag.findUnique({
    where: { id },
    include: {
      photos: { orderBy: { createdAt: "asc" } },
      assignedTo: { select: { name: true } },
      contact: { select: { name: true, company: true, email: true } },
      raisedBy: { select: { name: true } },
      resolvedBy: { select: { name: true } },
      job: { select: { name: true, parent: { select: { name: true } } } },
      plot: {
        select: {
          name: true,
          plotNumber: true,
          siteId: true,
          site: { select: { name: true, location: true } },
        },
      },
    },
  });

  if (!snag) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      snag.plot.siteId,
    ))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { default: jsPDF } = await import("jspdf");
  type AutoTableFn = (
    doc: import("jspdf").jsPDF,
    options: Record<string, unknown>,
  ) => void;
  const autoTable = (await import("jspdf-autotable")).default as AutoTableFn;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Header
  doc.setFontSize(18);
  doc.text("Snag Report", 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(snag.plot.site.name, 14, 30);
  doc.setFontSize(8);
  doc.text(`Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 36);
  doc.setTextColor(0);

  // Status + priority chips at top right
  const priorityColors: Record<string, [number, number, number]> = {
    LOW: [148, 163, 184],
    MEDIUM: [180, 83, 9],
    HIGH: [217, 70, 0],
    CRITICAL: [220, 38, 38],
  };
  const statusColors: Record<string, [number, number, number]> = {
    OPEN: [220, 38, 38],
    IN_PROGRESS: [29, 78, 216],
    RESOLVED: [22, 163, 74],
    CLOSED: [100, 116, 139],
  };
  const drawChip = (
    label: string,
    color: [number, number, number],
    x: number,
    y: number,
  ) => {
    doc.setFillColor(...color);
    doc.setTextColor(255);
    doc.roundedRect(x, y - 4, 28, 6, 1, 1, "F");
    doc.setFontSize(8);
    doc.text(label, x + 14, y, { align: "center", baseline: "middle" });
    doc.setTextColor(0);
  };
  drawChip(
    snag.status,
    statusColors[snag.status] ?? [100, 100, 100],
    160,
    24,
  );
  drawChip(
    snag.priority,
    priorityColors[snag.priority] ?? [100, 100, 100],
    160,
    32,
  );

  // Description block
  doc.setFontSize(13);
  doc.text("Defect", 14, 52);
  doc.setFontSize(10);
  const descLines = doc.splitTextToSize(snag.description, 180);
  doc.text(descLines, 14, 60);

  let cursorY = 60 + descLines.length * 5 + 10;

  // Details table
  doc.setFontSize(12);
  doc.text("Details", 14, cursorY);
  cursorY += 4;
  autoTable(doc, {
    startY: cursorY,
    body: [
      ["Plot", snag.plot.plotNumber ? `Plot ${snag.plot.plotNumber}` : snag.plot.name],
      ["Site", `${snag.plot.site.name}${snag.plot.site.location ? ` — ${snag.plot.site.location}` : ""}`],
      ["Job", snag.job ? `${snag.job.parent?.name ?? ""}${snag.job.parent ? " · " : ""}${snag.job.name}` : "—"],
      ["Location", snag.location || "—"],
      ["Raised", `${format(snag.createdAt, "dd MMM yyyy")} by ${snag.raisedBy?.name ?? "Unknown"}`],
      ["Assigned to (internal)", snag.assignedTo?.name ?? "Unassigned"],
      [
        "Contractor",
        snag.contact
          ? `${snag.contact.company ? snag.contact.company + " — " : ""}${snag.contact.name}${snag.contact.email ? ` (${snag.contact.email})` : ""}`
          : "Unassigned",
      ],
      [
        "Resolved",
        snag.resolvedAt
          ? `${format(snag.resolvedAt, "dd MMM yyyy")}${snag.resolvedBy ? ` by ${snag.resolvedBy.name}` : ""}`
          : "—",
      ],
    ],
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { cellWidth: 50, fontStyle: "bold" } },
  });
  cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Notes
  if (snag.notes) {
    doc.setFontSize(12);
    doc.text("Notes", 14, cursorY);
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(snag.notes, 180);
    doc.text(noteLines, 14, cursorY + 6);
    cursorY += noteLines.length * 4 + 12;
  }

  // Photos: list filenames + URLs (we don't embed images to keep the
  // PDF small — the URLs let the recipient open them in a browser).
  if (snag.photos.length > 0) {
    if (cursorY > 240) {
      doc.addPage();
      cursorY = 20;
    }
    doc.setFontSize(12);
    doc.text(`Photos (${snag.photos.length})`, 14, cursorY);
    cursorY += 4;
    autoTable(doc, {
      startY: cursorY,
      head: [["Tag", "Captured", "URL"]],
      body: snag.photos.map((p) => [
        p.tag || "—",
        format(p.createdAt, "dd MMM yyyy"),
        p.url,
      ]),
      styles: { fontSize: 7, cellPadding: 1, overflow: "linebreak" },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
      columnStyles: { 2: { cellWidth: 120 } },
    });
  }

  const pdfBytes = doc.output("arraybuffer");
  const filename = `Snag_${snag.plot.plotNumber || snag.plot.name}_${snag.id.slice(-6)}.pdf`.replace(/\s+/g, "_");

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
