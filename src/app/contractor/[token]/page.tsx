import { format, parseISO, addDays, startOfWeek, isWithinInterval } from "date-fns";
import { HardHat, PlayCircle, Clock, AlertTriangle, CheckCircle2, Phone, Mail, Building2, Package, Truck, FileText, Download, ExternalLink, CalendarDays, Briefcase, LinkIcon, ClipboardCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { verifyContractorToken } from "@/lib/share-token";
import { SnagSignOffCard } from "./SnagSignOffCard";
import { PrintButton } from "./PrintButton";
import { RequestSignOffButton } from "./RequestSignOffButton";
import { ContractorJobActionRow } from "./ContractorJobActionRow";
import { MiniGantt } from "@/components/shared/MiniGantt";
import { getCustomerBranding } from "@/lib/branding";
import { PLATFORM, type CustomerBranding } from "@/lib/platform";

export const dynamic = "force-dynamic";

function plotLabel(plot: { plotNumber: string | null; name: string }) {
  return plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name;
}

function fmtDate(d: string | Date | null) {
  if (!d) return "—";
  const date = typeof d === "string" ? parseISO(d) : d;
  return format(date, "dd MMM yyyy");
}

function fmtShort(d: string | Date | null) {
  if (!d) return "—";
  const date = typeof d === "string" ? parseISO(d) : d;
  return format(date, "dd MMM");
}

const PRIORITY_LABEL: Record<string, string> = { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

// (May 2026 audit O-7 / O-8) Friendly "link not active" page replacing
// the previous `notFound()` calls — pre-fix an expired or revoked link
// dropped the user on a generic 404 with no actionable message.
function LinkInactiveCard({
  reason,
  brand,
}: {
  reason: string;
  brand?: CustomerBranding;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white p-4">
      <div className="max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
        {/* (Jun 2026 white-label) Lead the error card with the customer's
            logo so even a dead link still feels like the builder's page. */}
        {brand?.logoUrl ? (
          <img
            src={brand.logoUrl}
            alt={brand.brandName}
            className="mx-auto mb-5 h-10 w-auto max-w-[12rem] object-contain"
          />
        ) : null}
        <LinkIcon className="mx-auto size-12 text-amber-400" />
        <h1 className="mt-4 text-xl font-semibold text-slate-800">
          This link isn&apos;t active
        </h1>
        <p className="mt-2 text-sm text-slate-500">{reason}</p>
        <p className="mt-4 text-xs text-slate-400">
          Ask the site team to send you a fresh link. If you think this is a
          mistake, get in touch with them directly.
        </p>
        {brand?.supportEmail && (
          <p className="mt-2 text-xs text-slate-400">
            Contact{" "}
            <a
              href={`mailto:${brand.supportEmail}`}
              className="font-medium underline"
            >
              {brand.supportEmail}
            </a>
          </p>
        )}
        <p className="mt-6 text-[11px] text-slate-300">{PLATFORM.poweredBy}</p>
      </div>
    </main>
  );
}

export default async function ContractorSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // (Jun 2026 white-label) Branding reads only the AppSettings singleton —
  // no token/contact data — so it's safe to load before the token check and
  // brand the error card too.
  const brand = await getCustomerBranding();

  const payload = verifyContractorToken(token);
  if (!payload) {
    return (
      <LinkInactiveCard
        reason="The link may have expired, or the token is no longer valid."
        brand={brand}
      />
    );
  }

  const { contactId, siteId } = payload;

  const [contact, site] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, name: true, company: true, email: true, phone: true },
    }),
    prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, name: true, location: true },
    }),
  ]);

  if (!contact || !site) {
    return (
      <LinkInactiveCard
        reason="The contact or site this link refers to is no longer available."
        brand={brand}
      />
    );
  }

  const jobContractors = await prisma.jobContractor.findMany({
    // (Jun 2026 Wave-4 B7) LEAF jobs only — contractors can be assigned to
    // parent/rollup jobs, and without this filter a phantom rollup row
    // appeared in Active/Upcoming/Completed + the Mini Programme, and could
    // be actioned. Every other contractor surface (the API route,
    // Contractor Comms, on-site-today, and this page's own on-time calc)
    // already filters to leaves; this query was the outlier.
    where: { contactId, job: { plot: { siteId }, children: { none: {} } } },
    select: {
      job: {
        select: {
          id: true, name: true, status: true, startDate: true, endDate: true,
          actualEndDate: true, originalEndDate: true,
          stageCode: true, signOffNotes: true,
          plot: { select: { id: true, plotNumber: true, name: true } },
        },
      },
    },
  });

  // (May 2026 Keith strategic) On-time performance chip.
  //
  // Contractors don't usually see how they're being scored. Showing
  // them their on-time rate next to the site average creates a soft
  // accountability loop — once you know you're behind the rest, the
  // next job tends to land closer to schedule. Reuses the canonical
  // "completed by the agreed end date" rule: actualEndDate is on
  // time iff it's ≤ originalEndDate (the immutable plan baseline,
  // never the slipped endDate).
  const siteCompletedRows = await prisma.jobContractor.findMany({
    where: {
      job: {
        plot: { siteId },
        status: "COMPLETED",
        // originalEndDate is non-nullable on Job — no filter needed.
        actualEndDate: { not: null },
        children: { none: {} },
      },
    },
    select: {
      contactId: true,
      job: {
        select: { id: true, actualEndDate: true, originalEndDate: true },
      },
    },
  });
  // (Jun 2026 Wave-4 D4) Fault-aware: a late finish only counts against a
  // contractor when the manager ATTRIBUTED it to them (and didn't excuse it).
  // Weather / a late predecessor / a design change finishing the job late is
  // on-time as far as this contractor is concerned — matching the in-app
  // leaderboard. jobId → (contactId → attributed working-days late).
  const siteLateEvents = await prisma.latenessEvent.findMany({
    where: { siteId, jobId: { not: null }, excused: false, attributedContactId: { not: null } },
    select: { jobId: true, attributedContactId: true },
  });
  const faultJobs = new Set<string>(); // jobId → has any attributed fault
  const faultJobContractor = new Set<string>(); // `${jobId}|${contactId}`
  for (const e of siteLateEvents) {
    if (!e.jobId || !e.attributedContactId) continue;
    faultJobs.add(e.jobId);
    faultJobContractor.add(`${e.jobId}|${e.attributedContactId}`);
  }
  // This contractor's rate: on-time unless a delay was attributed to THEM.
  const myRows = siteCompletedRows.filter((r) => r.contactId === contactId);
  const contractorOnTime =
    myRows.length === 0
      ? null
      : Math.round(
          (myRows.filter((r) => !faultJobContractor.has(`${r.job.id}|${r.contactId}`)).length /
            myRows.length) *
            100,
        );
  // (Jun 2026 Wave-4 S7) Site average over DISTINCT jobs (a job shared by N
  // trades is counted once, not N times), late if ANY attributed fault.
  const distinctSiteJobs = new Set(siteCompletedRows.map((r) => r.job.id));
  const siteOnTime =
    distinctSiteJobs.size === 0
      ? null
      : Math.round(
          ([...distinctSiteJobs].filter((id) => !faultJobs.has(id)).length /
            distinctSiteJobs.size) *
            100,
        );
  const contractorCompletedCount = myRows.length;

  // (#168) Chronological by startDate everywhere a job list appears.
  const byStartDate = (a: { startDate: Date | null }, b: { startDate: Date | null }) => {
    if (!a.startDate && !b.startDate) return 0;
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return a.startDate.getTime() - b.startDate.getTime();
  };
  const jobs = jobContractors.map((jc) => jc.job).sort(byStartDate);
  const liveJobs = jobs.filter((j) => j.status === "IN_PROGRESS");
  const nextJobs = jobs.filter((j) => j.status === "NOT_STARTED");
  const completedJobs = jobs.filter((j) => j.status === "COMPLETED");

  // (May 2026 Keith request) Toolbox talks this contractor was linked
  // to — surfaced on the shared page exactly as on the internal card.
  // REQUESTED talks (status: REQUESTED) get pulled separately and
  // pinned to the top so a contractor opening the link sees what they
  // need to action.
  const toolboxTalksAll = await prisma.toolboxTalk.findMany({
    where: {
      siteId,
      contractorIds: { has: contactId },
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      topic: true,
      notes: true,
      status: true,
      requestedAt: true,
      dueBy: true,
      deliveredAt: true,
      attachments: {
        orderBy: { createdAt: "asc" },
        select: { id: true, url: true, fileName: true, size: true },
      },
      documentUrl: true,
      documentFileName: true,
      documentSize: true,
    },
    orderBy: { requestedAt: "desc" },
  });
  const toolboxRequests = toolboxTalksAll.filter((t) => t.status === "REQUESTED");
  const toolboxTalks = toolboxTalksAll.filter((t) => t.status === "COMPLETED");

  // (Jun 2026 Q15) Upcoming inspection hold-points anchored to THIS
  // contractor's jobs — the trade needs to know an inspector is coming
  // (area ready, access clear) and that a hard hold blocks their job's
  // sign-off until it passes. Read-only; results/certs stay internal.
  const upcomingInspections = await prisma.inspection.findMany({
    where: {
      plot: { siteId },
      status: { in: ["SCHEDULED", "BOOKED", "OVERDUE"] },
      anchorJob: { contractors: { some: { contactId } } },
    },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      scheduledDate: true,
      bookedDate: true,
      isBlocking: true,
      plot: { select: { plotNumber: true, name: true } },
      anchorJob: { select: { name: true } },
    },
    orderBy: { scheduledDate: "asc" },
  });

  const openSnagsRaw = await prisma.snag.findMany({
    where: { contactId, plot: { siteId }, status: { in: ["OPEN", "IN_PROGRESS"] } },
    select: {
      id: true, description: true, status: true, priority: true, location: true, notes: true,
      // (Jun 2026 Wave-4 S6) drives the contractor card's "Requested" badge.
      signOffRequestedAt: true,
      plot: { select: { id: true, plotNumber: true, name: true } },
      photos: { select: { id: true, url: true, tag: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  // (May 2026 audit O-P0) The single `Snag.notes` text column is
  // append-only — both admin notes and contractor-via-link replies
  // accumulate in the same field. Pre-fix the contractor portal
  // rendered the WHOLE field, leaking internal admin notes like
  // "third time this contractor's missed it" to the contractor. Now
  // we filter to only the contractor-prefixed lines server-side
  // before the data ever reaches the public page. Schema fix
  // (separate internalNotes / publicNotes columns) is tracked for a
  // future sprint — this is the lower-risk in-flight mitigation.
  const openSnags = openSnagsRaw.map((s) => {
    // (Jun 2026 Wave-4 S6) Normalise the Date to an ISO string so the
    // client card prop stays string-only across the RSC boundary.
    const signOffRequestedAt = s.signOffRequestedAt
      ? s.signOffRequestedAt.toISOString()
      : null;
    if (!s.notes) return { ...s, signOffRequestedAt };
    const contractorLines = s.notes
      .split("\n")
      .filter((line) => /^\[[^\]]+\]\s+Contractor notes/i.test(line));
    return {
      ...s,
      signOffRequestedAt,
      notes: contractorLines.length > 0 ? contractorLines.join("\n") : null,
    };
  });

  // Contractor-scoped documents (RAMS, method statements) — visible here
  // so contractors can download their own paperwork without asking.
  // Keith Apr 2026 Q2=a.
  const contractorDocuments = await prisma.siteDocument.findMany({
    where: { contactId },
    select: {
      id: true, name: true, url: true, fileName: true,
      fileSize: true, mimeType: true, category: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Drawings for plots this contractor is working on — parity with
  // Contractor Comms on the internal side (Apr 2026: "share link doesn't
  // feature all the info Contractor Comms does").
  const plotIdsForContractor = [...new Set(jobs.map((j) => j.plot.id))];
  const drawings = plotIdsForContractor.length > 0
    ? await prisma.siteDocument.findMany({
        where: {
          siteId,
          OR: [
            { plotId: { in: plotIdsForContractor } },
            { plotId: null }, // site-wide drawings
          ],
          category: "DRAWING",
        },
        select: {
          id: true, name: true, url: true, fileName: true,
          mimeType: true, fileSize: true, createdAt: true,
          plot: { select: { id: true, plotNumber: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // Which live jobs already have a sign-off request logged? Used by the
  // RequestSignOffButton to show "already requested" state without another
  // client-side fetch.
  const liveJobIds = jobs.filter((j) => j.status === "IN_PROGRESS").map((j) => j.id);
  const allJobIds = jobs.map((j) => j.id);
  const signOffRequests = liveJobIds.length > 0
    ? await prisma.jobAction.findMany({
        where: { jobId: { in: liveJobIds }, action: "request_signoff" },
        select: { jobId: true },
        distinct: ["jobId"],
      })
    : [];
  const requestedJobIds = new Set(signOffRequests.map((r) => r.jobId));

  // (May 2026 contractor self-service) Which jobs already have
  // contractor self-attestations? Surfaces the "Start confirmed" /
  // "Completion confirmed" badges instead of the button.
  const contractorActions = allJobIds.length > 0
    ? await prisma.jobAction.findMany({
        where: {
          jobId: { in: allJobIds },
          action: { in: ["confirm_start", "confirm_complete"] },
        },
        select: { jobId: true, action: true },
      })
    : [];
  const startedJobIds = new Set(
    contractorActions.filter((a) => a.action === "confirm_start").map((a) => a.jobId),
  );
  const completedJobIds = new Set(
    contractorActions.filter((a) => a.action === "confirm_complete").map((a) => a.jobId),
  );

  const jobIds = jobs.map((j) => j.id);
  const materialOrders = jobIds.length > 0
    ? await prisma.materialOrder.findMany({
        where: { jobId: { in: jobIds } },
        select: {
          id: true, status: true, itemsDescription: true, dateOfOrder: true,
          expectedDeliveryDate: true, deliveredDate: true,
          supplier: { select: { name: true } },
          job: { select: { name: true, plot: { select: { plotNumber: true, name: true } } } },
          orderItems: { select: { name: true, quantity: true, unit: true } },
        },
        orderBy: { dateOfOrder: "asc" },
      })
    : [];

  // Split orders into categories
  const now = new Date();
  const in14Days = new Date(now);
  in14Days.setDate(in14Days.getDate() + 14);

  const upcomingOrders = materialOrders.filter((o) => {
    if (o.status === "DELIVERED") return false;
    const d = o.expectedDeliveryDate || o.dateOfOrder;
    return d ? d <= in14Days : false;
  });
  const onSiteOrders = materialOrders.filter((o) => o.status === "DELIVERED");
  const futureOrders = materialOrders.filter((o) => {
    if (o.status === "DELIVERED") return false;
    const d = o.expectedDeliveryDate || o.dateOfOrder;
    return !d || d > in14Days;
  });

  type OrderRow = typeof materialOrders[number];

  function orderDateLabel(order: OrderRow) {
    const isSent = order.status === "ORDERED";
    if (order.status === "DELIVERED") return `Delivered ${fmtShort(order.deliveredDate)}`;
    if (isSent) return `Ordered ${fmtShort(order.dateOfOrder)}${order.expectedDeliveryDate ? ` · Delivery due ${fmtShort(order.expectedDeliveryDate)}` : ""}`;
    return `Order due ${fmtShort(order.dateOfOrder)}${order.expectedDeliveryDate ? ` · Delivery due ${fmtShort(order.expectedDeliveryDate)}` : ""}`;
  }

  function orderBadge(order: OrderRow) {
    if (order.status === "DELIVERED") return { label: "On Site", cls: "bg-green-100 text-green-700" };
    if (order.status === "ORDERED") return { label: "Sent", cls: "bg-blue-100 text-blue-700" };
    return { label: "Not Ordered", cls: "bg-amber-100 text-amber-700" };
  }

  function renderOrder(order: OrderRow) {
    const badge = orderBadge(order);
    return (
      <div key={order.id} className="rounded-lg border bg-white px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm">{order.supplier.name}</p>
            {order.orderItems.length > 0 ? (
              <ul className="mt-0.5 space-y-0.5">
                {order.orderItems.map((item, idx) => (
                  <li key={idx} className="text-xs text-muted-foreground">
                    {item.quantity} {item.unit} — {item.name}
                  </li>
                ))}
              </ul>
            ) : order.itemsDescription ? (
              <p className="text-xs text-muted-foreground">{order.itemsDescription}</p>
            ) : null}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {order.job ? `${plotLabel(order.job.plot)} · ${order.job.name}` : "One-off order"}
            </p>
            <p className="text-[11px] text-muted-foreground">{orderDateLabel(order)}</p>
          </div>
          <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
      </div>
    );
  }

  const expiresAt = new Date(payload.exp);

  return (
    <div
      className="min-h-screen bg-slate-50"
      style={{ ["--brand" as string]: brand.primaryColor }}
    >
      <div className="border-b bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto max-w-2xl">
          {/* (Jun 2026 white-label) Lead with the customer brand — logo +
              business name — above the contractor's own name. Falls back to
              the HardHat avatar (tinted with the brand accent) when no logo
              is set. */}
          {(brand.logoUrl || brand.brandNameRaw) && (
            <div className="mb-3 flex items-center gap-2 border-b pb-3">
              {brand.logoUrl ? (
                <img
                  src={brand.logoUrl}
                  alt={brand.brandName}
                  className="h-8 w-auto max-w-[12rem] object-contain"
                />
              ) : (
                <span className="text-base font-bold text-slate-800">
                  {brand.brandName}
                </span>
              )}
            </div>
          )}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="flex size-10 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: brand.primaryColor }}
              >
                <HardHat className="size-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold">{contact.name}</h1>
                {contact.company && <p className="text-sm text-muted-foreground">{contact.company}</p>}
              </div>
            </div>
            <PrintButton />
          </div>
          {/* (May 2026 Keith strategic) On-time performance chip.
              Renders only once the contractor has ≥1 completed job
              at this site — pre-completion there's no signal to
              show. Site average shown alongside as the soft
              comparator that drives behaviour. */}
          {contractorOnTime !== null && contractorCompletedCount >= 1 && (
            <div className="mt-3">
              {(() => {
                const aboveAvg =
                  siteOnTime !== null && contractorOnTime >= siteOnTime;
                return (
                  <div
                    className={`inline-flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
                      aboveAvg
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-amber-200 bg-amber-50 text-amber-900"
                    }`}
                  >
                    <span>
                      Your on-time rate:{" "}
                      <span className="text-sm font-bold">
                        {contractorOnTime}%
                      </span>{" "}
                      ({contractorCompletedCount} job
                      {contractorCompletedCount === 1 ? "" : "s"})
                    </span>
                    {siteOnTime !== null && (
                      <span className="opacity-80">
                        · site average {siteOnTime}%
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="size-4" />
              <span>{site.name}{site.location ? ` · ${site.location}` : ""}</span>
            </div>
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-sm hover:underline" style={{ color: brand.primaryColor }}>
                <Phone className="size-4" /> {contact.phone}
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-sm hover:underline" style={{ color: brand.primaryColor }}>
                <Mail className="size-4" /> {contact.email}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-3 px-4 py-6">
        {/* Mini Programme — 12-week rows=plots Gantt. Same visual Keith
            uses on the internal Contractor Comms page. Apr 2026 UX audit
            follow-up: "shareable links don't feature all the info". */}
        {jobs.length > 0 && (
          <details className="group rounded-lg border bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-blue-700 [&::-webkit-details-marker]:hidden">
              <Briefcase className="size-5 text-blue-600" />
              Mini Programme
              <svg className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
            </summary>
            <div className="border-t px-4 py-3">
              {/* (May 2026 Keith bug report) Feed every job the contractor
                  is on so the Mini Programme shows all their plots —
                  MiniGantt now sizes its window to the jobs it's given. */}
              <MiniGantt
                siteId={siteId}
                linkJobs={false}
                linkPlots={false}
                jobs={jobs.map((j) => ({
                  id: j.id,
                  name: j.name,
                  status: j.status,
                  startDate: j.startDate?.toISOString() ?? null,
                  endDate: j.endDate?.toISOString() ?? null,
                  plot: j.plot,
                  live: j.status === "IN_PROGRESS",
                }))}
              />
            </div>
          </details>
        )}

        {/* Day Sheets — Mon-Sun, jobs active each day this week. */}
        {(() => {
          const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
          const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
          const allJobs = [...liveJobs, ...nextJobs];
          const jobsForDay = (day: Date) =>
            allJobs.filter((j) => {
              if (!j.startDate || !j.endDate) return false;
              // (Jun 2026 Wave-4 B8) date-fns throws a RangeError when
              // end < start, which would 500 this PUBLIC page. A job whose
              // end precedes its start (a drag slip / bad data) must just be
              // skipped, not crash the whole contractor view.
              if (j.endDate < j.startDate) return false;
              return isWithinInterval(day, { start: j.startDate, end: j.endDate });
            });
          const hasAnything = days.some((d) => jobsForDay(d).length > 0);
          if (!hasAnything) return null;
          return (
            <details className="group rounded-lg border bg-white shadow-sm">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-indigo-700 [&::-webkit-details-marker]:hidden">
                <CalendarDays className="size-5 text-indigo-500" />
                Day Sheets (this week)
                <svg className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
              </summary>
              <div className="border-t px-4 py-3">
                <div className="space-y-1.5">
                  {days.map((day) => {
                    const jobsToday = jobsForDay(day);
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    return (
                      <div
                        key={day.toISOString()}
                        className={`rounded-lg border px-3 py-2 ${isWeekend ? "bg-slate-50 border-slate-100" : "bg-white border-border"}`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold">
                            {format(day, "EEE d MMM")}
                            {isWeekend && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">(weekend)</span>}
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            {jobsToday.length === 0 ? "No work" : `${jobsToday.length} job${jobsToday.length === 1 ? "" : "s"}`}
                          </span>
                        </div>
                        {jobsToday.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {jobsToday.map((j) => (
                              <li key={j.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span className="inline-block size-1.5 shrink-0 rounded-full bg-green-500" />
                                <span className="truncate">{j.name}</span>
                                <span className="text-slate-400">·</span>
                                <span className="shrink-0">{plotLabel(j.plot)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </details>
          );
        })()}

        {/* Drawings — plot-scoped + site-wide. Parity with Contractor
            Comms internal view. */}
        {drawings.length > 0 && (
          <details className="group rounded-lg border bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-blue-700 [&::-webkit-details-marker]:hidden">
              <FileText className="size-5 text-blue-500" />
              Drawings ({drawings.length})
              <svg className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
            </summary>
            <div className="border-t px-4 py-3 space-y-1.5">
              {drawings.map((d) => {
                const sizeKb = d.fileSize ? Math.round(d.fileSize / 1024) : null;
                return (
                  <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-blue-50/50 px-3 py-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <FileText className="size-4 shrink-0 text-blue-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {d.plot ? (d.plot.plotNumber ? `Plot ${d.plot.plotNumber}` : d.plot.name) : "Site-wide"}
                          {sizeKb !== null ? ` · ${sizeKb} KB` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {/* (May 2026 a11y audit #32 + #129) Icon-only
                          links get aria-label and the icon is hidden
                          from screen readers; "(opens in new tab)" is
                          announced by an sr-only span. */}
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1 text-muted-foreground hover:bg-white hover:text-foreground"
                        title="Open"
                        aria-label="Open document in new tab"
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">(opens in new tab)</span>
                      </a>
                      <a
                        href={d.url}
                        download={d.fileName}
                        className="rounded p-1 text-muted-foreground hover:bg-white hover:text-foreground"
                        title="Download"
                        aria-label="Download document"
                      >
                        <Download className="size-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        <details className="group rounded-lg border bg-white shadow-sm">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-green-700 [&::-webkit-details-marker]:hidden">
            <PlayCircle className="size-5 text-green-600" />
            Active Jobs ({liveJobs.length})
            <svg className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
          </summary>
          <div className="border-t px-4 py-3">
            {liveJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active jobs right now.</p>
            ) : (
              <div className="space-y-2">
                {liveJobs.map((job) => (
                  <div key={job.id} className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{job.name}</p>
                        <p className="text-sm text-muted-foreground">{plotLabel(job.plot)}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">Due {fmtDate(job.endDate)}</p>
                    </div>
                    {/* (May 2026 contractor self-service) Self-attestation
                        row — contractor logs start/finish/note independently
                        of the admin status flips. */}
                    <div className="mt-2">
                      <ContractorJobActionRow
                        token={token}
                        jobId={job.id}
                        startedAlready={startedJobIds.has(job.id)}
                        completedAlready={completedJobIds.has(job.id)}
                      />
                    </div>
                    <div className="mt-2 flex justify-end">
                      <RequestSignOffButton
                        token={token}
                        jobId={job.id}
                        alreadyRequested={requestedJobIds.has(job.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>

        {nextJobs.length > 0 && (
          <details className="group rounded-lg border bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-blue-700 [&::-webkit-details-marker]:hidden">
              <Clock className="size-5 text-blue-500" />
              Upcoming Work ({nextJobs.length})
              <svg className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
            </summary>
            <div className="border-t px-4 py-3 space-y-2">
              {nextJobs.map((job) => (
                <div key={job.id} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{job.name}</p>
                      <p className="text-sm text-muted-foreground">{plotLabel(job.plot)}</p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>Starts {fmtDate(job.startDate)}</p>
                      <p>Due {fmtDate(job.endDate)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {upcomingOrders.length > 0 && (
          <details className="group rounded-lg border bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-purple-700 [&::-webkit-details-marker]:hidden">
              <Package className="size-5 text-purple-500" />
              Orders & Deliveries — Next 14 Days ({upcomingOrders.length})
              <svg className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
            </summary>
            <div className="border-t px-4 py-3 space-y-2">
              {upcomingOrders.map(renderOrder)}
            </div>
          </details>
        )}

        {onSiteOrders.length > 0 && (
          <details className="group rounded-lg border bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-green-700 [&::-webkit-details-marker]:hidden">
              <CheckCircle2 className="size-5 text-green-500" />
              Materials on Site ({onSiteOrders.length})
              <svg className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
            </summary>
            <div className="border-t px-4 py-3 space-y-2">
              {onSiteOrders.map(renderOrder)}
            </div>
          </details>
        )}

        {futureOrders.length > 0 && (
          <details className="group rounded-lg border bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-slate-500 [&::-webkit-details-marker]:hidden">
              <Truck className="size-5 text-slate-400" />
              Future Orders & Deliveries ({futureOrders.length})
              <svg className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
            </summary>
            <div className="border-t px-4 py-3 space-y-2">
              {futureOrders.map(renderOrder)}
            </div>
          </details>
        )}

        {openSnags.length > 0 && (
          <details className="group rounded-lg border bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-orange-700 [&::-webkit-details-marker]:hidden">
              <AlertTriangle className="size-5 text-orange-500" />
              Open Snags ({openSnags.length})
              <svg className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
            </summary>
            <div className="border-t px-4 py-3 space-y-2">
              {openSnags.map((snag) => (
                <SnagSignOffCard key={snag.id} snag={snag} token={token} />
              ))}
            </div>
          </details>
        )}

        {/* (May 2026 Keith request) REQUESTED toolbox talks — open by
            default so a contractor following the link sees what's
            outstanding without having to expand. Shows the topic, the
            manager's reason, any attached briefing docs, and the due
            date. No acknowledge button yet — the manager still flips
            status from in-app once the talk has actually happened. */}
        {toolboxRequests.length > 0 && (
          <details
            open
            className="group rounded-lg border border-amber-300 bg-amber-50 shadow-sm"
          >
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-amber-800 [&::-webkit-details-marker]:hidden">
              <HardHat className="size-5 text-amber-600" />
              Toolbox Talks Requested of You ({toolboxRequests.length})
              <svg
                className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </summary>
            <div className="space-y-2 border-t border-amber-200 px-4 py-3">
              {toolboxRequests.map((t) => {
                const atts =
                  t.attachments.length > 0
                    ? t.attachments
                    : t.documentUrl
                      ? [
                          {
                            id: `legacy-${t.id}`,
                            url: t.documentUrl,
                            fileName: t.documentFileName || "Attachment",
                            size: t.documentSize,
                          },
                        ]
                      : [];
                return (
                  <div
                    key={t.id}
                    className="rounded-md border border-amber-200 bg-white px-3 py-2.5"
                  >
                    <p className="font-medium text-slate-800">{t.topic}</p>
                    {t.notes && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                        {t.notes}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                      <span>
                        Requested{" "}
                        {t.requestedAt.toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                        })}
                      </span>
                      {t.dueBy && (
                        <span className="font-semibold text-amber-700">
                          Due by{" "}
                          {t.dueBy.toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                    {atts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {atts.map((a) => (
                          <a
                            key={a.id}
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <span className="max-w-[180px] truncate">
                              {a.fileName}
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {/* (Jun 2026 Q15) Inspection hold-points on this contractor's
            jobs — date, plot, and whether the hold blocks their job's
            sign-off. Open by default: an inspector turning up to an
            unready area is exactly what this section prevents. */}
        {upcomingInspections.length > 0 && (
          <details open className="group rounded-lg border bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-violet-700 [&::-webkit-details-marker]:hidden">
              <ClipboardCheck className="size-5 text-violet-500" />
              Inspections on your jobs ({upcomingInspections.length})
              <svg className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
            </summary>
            <div className="space-y-1.5 border-t px-4 py-3">
              <p className="mb-2 text-[11px] text-muted-foreground">
                An inspector is due on these dates — please make sure the work area is finished, tidy and accessible.
              </p>
              {upcomingInspections.map((ins) => {
                const when = ins.bookedDate ?? ins.scheduledDate;
                return (
                  <div key={ins.id} className="rounded-md bg-violet-50/60 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-slate-700">
                        {ins.name}
                        <span className="ml-2 text-[10px] font-semibold uppercase text-violet-600">{String(ins.type).replace(/_/g, " ")}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {when.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                        {ins.bookedDate ? " (booked)" : ""}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Plot {ins.plot.plotNumber ?? ins.plot.name}
                      {ins.anchorJob ? ` · ${ins.anchorJob.name}` : ""}
                      {ins.isBlocking ? (
                        <span className="ml-2 font-medium text-red-600">Your job can&apos;t be signed off until this passes.</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {/* (May 2026 Keith request) Completed toolbox talks this
            contractor was linked to — same view as the manager's
            internal card. */}
        {toolboxTalks.length > 0 && (
          <details className="group rounded-lg border bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-amber-700 [&::-webkit-details-marker]:hidden">
              <HardHat className="size-5 text-amber-500" />
              Toolbox Talks ({toolboxTalks.length})
              <svg className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
            </summary>
            <div className="space-y-1.5 border-t px-4 py-3">
              {toolboxTalks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-amber-50/60 px-3 py-2 text-sm"
                >
                  <span className="truncate font-medium text-slate-700">
                    {t.topic}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {/* deliveredAt is now nullable in the schema; this
                        list filters to COMPLETED rows which always have
                        one, but guard anyway so a partial migration
                        can't crash the public page. */}
                    {t.deliveredAt
                      ? t.deliveredAt.toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                        })
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}

        {contractorDocuments.length > 0 && (
          <details className="group rounded-lg border bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-purple-700 [&::-webkit-details-marker]:hidden">
              <FileText className="size-5 text-purple-500" />
              Your Documents ({contractorDocuments.length})
              <svg className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
            </summary>
            <div className="border-t px-4 py-3 space-y-1.5">
              <p className="mb-2 text-[11px] text-muted-foreground">
                RAMS, method statements and anything else shared with you.
              </p>
              {contractorDocuments.map((d) => {
                const sizeKb = d.fileSize ? Math.round(d.fileSize / 1024) : null;
                return (
                  <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-purple-50/50 px-3 py-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <FileText className="size-4 shrink-0 text-purple-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {d.category || "Document"}{sizeKb !== null ? ` · ${sizeKb} KB` : ""} · {format(d.createdAt, "dd MMM yyyy")}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {/* (May 2026 a11y audit #32 + #129) Icon-only
                          links get aria-label and the icon is hidden
                          from screen readers; "(opens in new tab)" is
                          announced by an sr-only span. */}
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1 text-muted-foreground hover:bg-white hover:text-foreground"
                        title="Open"
                        aria-label="Open document in new tab"
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">(opens in new tab)</span>
                      </a>
                      <a
                        href={d.url}
                        download={d.fileName}
                        className="rounded p-1 text-muted-foreground hover:bg-white hover:text-foreground"
                        title="Download"
                        aria-label="Download document"
                      >
                        <Download className="size-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {completedJobs.length > 0 && (
          <details className="group rounded-lg border bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-slate-500 [&::-webkit-details-marker]:hidden">
              <CheckCircle2 className="size-5 text-slate-400" />
              Completed ({completedJobs.length})
              <svg className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
            </summary>
            <div className="border-t px-4 py-3">
              <div className="flex flex-wrap gap-2">
                {completedJobs.map((job) => (
                  <span key={job.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                    {job.name} · {plotLabel(job.plot)}
                  </span>
                ))}
              </div>
            </div>
          </details>
        )}

        <p className="text-center text-[11px] text-muted-foreground">
          This link is read-only and always up to date. {PLATFORM.poweredBy}.
        </p>
      </div>
    </div>
  );
}
