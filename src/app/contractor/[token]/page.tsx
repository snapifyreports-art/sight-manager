import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { HardHat, PlayCircle, Clock, AlertTriangle, CheckCircle2, Phone, Mail, Building2, Package, Truck, FileText, Download, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { verifyContractorToken } from "@/lib/share-token";
import { SnagSignOffCard } from "./SnagSignOffCard";

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

export default async function ContractorSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const payload = verifyContractorToken(token);
  if (!payload) notFound();

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

  if (!contact || !site) notFound();

  const jobContractors = await prisma.jobContractor.findMany({
    where: { contactId, job: { plot: { siteId } } },
    select: {
      job: {
        select: {
          id: true, name: true, status: true, startDate: true, endDate: true,
          stageCode: true, signOffNotes: true,
          plot: { select: { id: true, plotNumber: true, name: true } },
        },
      },
    },
  });

  const jobs = jobContractors.map((jc) => jc.job);
  const liveJobs = jobs.filter((j) => j.status === "IN_PROGRESS");
  const nextJobs = jobs
    .filter((j) => j.status === "NOT_STARTED")
    .sort((a, b) => {
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return a.startDate.getTime() - b.startDate.getTime();
    });
  const completedJobs = jobs.filter((j) => j.status === "COMPLETED");

  const openSnags = await prisma.snag.findMany({
    where: { contactId, plot: { siteId }, status: { in: ["OPEN", "IN_PROGRESS"] } },
    select: {
      id: true, description: true, status: true, priority: true, location: true, notes: true,
      plot: { select: { id: true, plotNumber: true, name: true } },
      photos: { select: { id: true, url: true, tag: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
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
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-blue-600 text-white">
              <HardHat className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">{contact.name}</h1>
              {contact.company && <p className="text-sm text-muted-foreground">{contact.company}</p>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="size-4" />
              <span>{site.name}{site.location ? ` · ${site.location}` : ""}</span>
            </div>
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <Phone className="size-4" /> {contact.phone}
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                <Mail className="size-4" /> {contact.email}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-3 px-4 py-6">
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
                <SnagSignOffCard key={snag.id} snag={snag} />
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
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-muted-foreground hover:bg-white hover:text-foreground" title="Open">
                        <ExternalLink className="size-3.5" />
                      </a>
                      <a href={d.url} download={d.fileName} className="rounded p-1 text-muted-foreground hover:bg-white hover:text-foreground" title="Download">
                        <Download className="size-3.5" />
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
          This link is read-only and always up to date.
          Powered by Sight Manager.
        </p>
      </div>
    </div>
  );
}
