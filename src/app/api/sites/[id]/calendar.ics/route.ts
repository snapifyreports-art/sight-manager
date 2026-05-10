import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #59 + #189) iCalendar feed for a site's programme.
 *
 * GET /api/sites/[id]/calendar.ics → application/calendar
 *
 * Subscribed by Outlook / Google / Apple Calendar so the manager
 * sees the site's job schedule + key milestones inline with their
 * personal calendar, refreshed automatically by the calendar app.
 *
 * Each LEAF job becomes a VEVENT spanning startDate→endDate (all-day
 * events because we don't track hours). Material-order delivery dates
 * become single-day VEVENTs.
 *
 * Auth: signed-in user with site access. Calendar apps don't preserve
 * cookies, so we accept either a session cookie OR a `?token=…` query
 * param signed with the share-token machinery (TODO: future batch).
 * For now this is session-only and a manager generates the URL while
 * logged in then keeps it open in their browser-cached calendar.
 */

function fmtDate(d: Date): string {
  // YYYYMMDD for all-day events.
  return d
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");
}

function fmtDateUtc(d: Date): string {
  // YYYYMMDDTHHMMSSZ for DTSTAMP / created.
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "")
    .replace(/T/, "T");
}

// iCal text-encoding: escape \, ;, ,, and CR/LF.
function escapeIcs(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Fold lines longer than 75 octets per RFC 5545.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    chunks.push((i === 0 ? "" : " ") + line.slice(i, i + 75));
    i += 75;
  }
  return chunks.join("\r\n");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { id: siteId } = await params;
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      siteId,
    ))
  ) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, name: true },
  });
  if (!site) {
    return new NextResponse("Not found", { status: 404 });
  }

  const jobs = await prisma.job.findMany({
    where: {
      plot: { siteId },
      children: { none: {} },
      startDate: { not: null },
      endDate: { not: null },
    },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      plot: { select: { name: true, plotNumber: true } },
    },
    orderBy: { startDate: "asc" },
  });

  const orders = await prisma.materialOrder.findMany({
    where: {
      OR: [
        { job: { plot: { siteId } } },
        { siteId },
      ],
      expectedDeliveryDate: { not: null },
      status: { in: ["ORDERED"] },
    },
    select: {
      id: true,
      itemsDescription: true,
      expectedDeliveryDate: true,
      supplier: { select: { name: true } },
      job: {
        select: {
          name: true,
          plot: { select: { name: true, plotNumber: true } },
        },
      },
    },
  });

  const now = new Date();
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//Sight Manager//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(`X-WR-CALNAME:${escapeIcs(site.name)} programme`);
  lines.push(`X-WR-CALDESC:Job + delivery schedule for ${escapeIcs(site.name)}`);

  for (const j of jobs) {
    if (!j.startDate || !j.endDate) continue;
    // All-day events end at the day AFTER the last working day
    // (DTEND is exclusive in iCal).
    const endExclusive = new Date(j.endDate);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    const plotLabel = j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name;
    const summary = `${plotLabel} — ${j.name}`;
    const desc =
      `${plotLabel} — ${j.name} (${j.status})\n` +
      `${site.name}`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:job-${j.id}@sight-manager`);
    lines.push(`DTSTAMP:${fmtDateUtc(now)}`);
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(j.startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${fmtDate(endExclusive)}`);
    lines.push(foldLine(`SUMMARY:${escapeIcs(summary)}`));
    lines.push(foldLine(`DESCRIPTION:${escapeIcs(desc)}`));
    lines.push("END:VEVENT");
  }

  for (const o of orders) {
    if (!o.expectedDeliveryDate) continue;
    const startDay = new Date(o.expectedDeliveryDate);
    const endExclusive = new Date(startDay);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    const plot = o.job?.plot;
    const plotLabel = plot?.plotNumber ? `Plot ${plot.plotNumber}` : plot?.name || "Site-wide";
    const summary = `🚚 Delivery: ${o.supplier?.name ?? "Supplier"} → ${plotLabel}`;
    const desc =
      `${o.itemsDescription || "Materials"}\n` +
      `Supplier: ${o.supplier?.name ?? "—"}\n` +
      `${o.job?.name ? `Job: ${o.job.name}\n` : ""}` +
      `${site.name}`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:order-${o.id}@sight-manager`);
    lines.push(`DTSTAMP:${fmtDateUtc(now)}`);
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(startDay)}`);
    lines.push(`DTEND;VALUE=DATE:${fmtDate(endExclusive)}`);
    lines.push(foldLine(`SUMMARY:${escapeIcs(summary)}`));
    lines.push(foldLine(`DESCRIPTION:${escapeIcs(desc)}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  // RFC 5545 says CRLF.
  const ics = lines.join("\r\n") + "\r\n";

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${site.name.replace(/\s+/g, "_")}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
