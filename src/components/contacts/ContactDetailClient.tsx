"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  HardHat,
  Package,
  Phone,
  Mail,
  Building2,
  ArrowLeft,
  Briefcase,
  AlertTriangle,
  FileText,
  ExternalLink,
  Download,
  Clock,
  CheckCircle2,
  PlayCircle,
  Archive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JobStatusBadge, SnagStatusBadge, SnagPriorityBadge } from "@/components/shared/StatusBadge";
import { LatenessSummary } from "@/components/lateness/LatenessSummary";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { useConfirmAction } from "@/hooks/useConfirmAction";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: string;
  company: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Job {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  stageCode: string | null;
  plot: {
    id: string;
    plotNumber: string | null;
    name: string;
    site: { id: string; name: string };
  };
}

interface Snag {
  id: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
  resolvedAt: string | null;
  plot: {
    id: string;
    plotNumber: string | null;
    name: string;
    site: { id: string; name: string };
  };
}

interface ContactDoc {
  id: string;
  name: string;
  url: string;
  fileName: string;
  fileSize: number | null;
  category: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
}

interface OrderRow {
  id: string;
  status: string;
  itemsDescription: string | null;
  expectedDeliveryDate: string | null;
  deliveredDate: string | null;
  dateOfOrder: string;
  supplier: { name: string };
  job: {
    id: string;
    name: string;
    plot: {
      plotNumber: string | null;
      name: string;
      site: { id: string; name: string };
    };
  } | null;
}

interface Props {
  contact: Contact;
  jobs: Job[];
  snags: Snag[];
  documents: ContactDoc[];
  orders: OrderRow[];
}

function plotLabel(plot: { plotNumber: string | null; name: string }) {
  return plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name;
}

interface Scorecard {
  score: number;
  onTime: number;
  daysLateJobs: number;
  daysLateTotal: number;
  onTimeRate: number;
  signOffRate: number;
  snagsRaised: number;
  snagsResolved: number;
  avgSnagResolveDays: number | null;
  distinctSites: number;
  jobs: { total: number; completed: number };
}

export function ContactDetailClient({ contact, jobs, snags, documents, orders }: Props) {
  const [activeTab, setActiveTab] = useState<"jobs" | "snags" | "documents" | "orders">("jobs");
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [archiving, setArchiving] = useState(false);
  const toast = useToast();
  const router = useRouter();
  // (May 2026 audit S-P0) Archive button on detail page mirrors the
  // list-page action — surfaces soft-delete anywhere the contact is
  // displayed, not just the master list. Same confirm flow + same API.
  const { confirmAction, dialogs: confirmDialogs } = useConfirmAction();

  function handleArchive() {
    confirmAction({
      title: "Archive Contractor",
      description: (
        <>
          Archive{" "}
          <span className="font-medium text-foreground">{contact.name}</span>?
          They&apos;ll disappear from pickers but every job they did,
          snag they raised, and document they uploaded stays attached
          to them. You can restore later from the contractors list.
        </>
      ),
      confirmLabel: "Archive",
      onConfirm: async () => {
        setArchiving(true);
        try {
          const res = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
          if (!res.ok) {
            throw new Error(await fetchErrorMessage(res, "Failed to archive contractor"));
          }
          toast.success(`${contact.name} archived`);
          router.push("/contacts");
          router.refresh();
        } finally {
          setArchiving(false);
        }
      },
    });
  }

  // (May 2026 audit #179) Pull the scorecard on mount. Best-effort —
  // if the API errors we just don't render the panel.
  useEffect(() => {
    let cancelled = false;
    if (contact.type !== "CONTRACTOR") return;
    fetch(`/api/contacts/${contact.id}/scorecard`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.score === "number") setScorecard(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [contact.id, contact.type]);

  // Segment jobs
  const liveJobs = jobs.filter((j) => j.status === "IN_PROGRESS");
  const upcomingJobs = jobs.filter((j) => j.status === "NOT_STARTED");
  const completedJobs = jobs.filter((j) => j.status === "COMPLETED");
  const openSnags = snags.filter((s) => s.status === "OPEN" || s.status === "IN_PROGRESS");
  const resolvedSnags = snags.filter((s) => s.status === "RESOLVED" || s.status === "CLOSED");

  const typeLabel = contact.type === "CONTRACTOR" ? "Contractor" : contact.type === "SUPPLIER" ? "Supplier" : contact.type;
  const typeBadge =
    contact.type === "CONTRACTOR" ? (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200">Contractor</Badge>
    ) : (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">{typeLabel}</Badge>
    );

  return (
    <div className="space-y-4">
      {/* Header with back + contact core */}
      <div className="space-y-3">
        <Link href="/contacts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-blue-600">
          <ArrowLeft className="size-3.5" />
          Back to Contacts
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <HardHat className="size-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">{contact.company || contact.name}</h1>
                {contact.company && (
                  <p className="text-sm text-muted-foreground">{contact.name}</p>
                )}
              </div>
              <div className="ml-2 shrink-0">{typeBadge}</div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-1 hover:text-blue-600">
                  <Phone className="size-3.5" />
                  {contact.phone}
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-1 hover:text-blue-600">
                  <Mail className="size-3.5" />
                  {contact.email}
                </a>
              )}
              {contact.company && (
                <span className="flex items-center gap-1">
                  <Building2 className="size-3.5" />
                  {contact.company}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleArchive}
              disabled={archiving}
              className="border-amber-200 text-amber-700 hover:bg-amber-50"
              title="Archive (soft-delete — restorable from contacts list)"
            >
              <Archive className="size-3.5" aria-hidden />
              <span className="ml-1 hidden sm:inline">{archiving ? "Archiving..." : "Archive"}</span>
            </Button>
          </div>
        </div>

        {contact.notes && (
          <div className="rounded-lg border bg-slate-50 p-3">
            <p className="text-xs font-medium text-muted-foreground">Notes</p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{contact.notes}</p>
          </div>
        )}
      </div>

      {/* Counts / summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Live Jobs</p>
            <p className="text-xl font-bold text-green-600">{liveJobs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Upcoming</p>
            <p className="text-xl font-bold text-blue-600">{upcomingJobs.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Open Snags</p>
            <p className={`text-xl font-bold ${openSnags.length > 0 ? "text-amber-600" : "text-slate-400"}`}>{openSnags.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Documents</p>
            <p className="text-xl font-bold text-purple-600">{documents.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* (#191) Lateness attributed to this contact — every slip the
          manager has flagged as caused by them. Empty hides itself. */}
      <LatenessSummary contactId={contact.id} status="all" />

      {/* (May 2026 audit #179) Contractor scorecard. Only rendered
          for contractors, only after the API responds. */}
      {scorecard && contact.type === "CONTRACTOR" && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Big score on the left */}
              <div className="flex shrink-0 items-center gap-3">
                <div
                  className={`flex size-16 items-center justify-center rounded-full text-2xl font-bold text-white ${
                    scorecard.score >= 80
                      ? "bg-emerald-500"
                      : scorecard.score >= 60
                        ? "bg-blue-500"
                        : scorecard.score >= 40
                          ? "bg-amber-500"
                          : "bg-red-500"
                  }`}
                >
                  {scorecard.score}
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Scorecard</p>
                  <p className="text-sm text-blue-900">
                    {scorecard.score >= 80
                      ? "Top performer"
                      : scorecard.score >= 60
                        ? "Solid"
                        : scorecard.score >= 40
                          ? "Mixed"
                          : "Needs attention"}
                  </p>
                </div>
              </div>
              {/* Stat strip */}
              <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                <ScoreStat label="On time" value={`${scorecard.onTimeRate}%`} sub={`${scorecard.onTime}/${scorecard.jobs.completed} jobs`} />
                <ScoreStat label="Signed off" value={`${scorecard.signOffRate}%`} sub={`${scorecard.jobs.completed} completed`} />
                <ScoreStat
                  label="Snag rate"
                  value={`${scorecard.snagsRaised}`}
                  sub={
                    scorecard.avgSnagResolveDays !== null
                      ? `${scorecard.avgSnagResolveDays}d avg fix`
                      : "no resolves yet"
                  }
                />
                <ScoreStat label="Sites" value={`${scorecard.distinctSites}`} sub="distinct" />
              </div>
            </div>
            {scorecard.daysLateJobs > 0 && (
              <p className="mt-3 text-xs text-blue-800">
                <span className="font-semibold">{scorecard.daysLateJobs}</span> job{scorecard.daysLateJobs !== 1 ? "s" : ""} ran past plan by a combined <span className="font-semibold">{scorecard.daysLateTotal}</span> days.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        {([
          ["jobs", `Jobs (${jobs.length})`, Briefcase],
          ["snags", `Snags (${snags.length})`, AlertTriangle],
          ["documents", `RAMS / Docs (${documents.length})`, FileText],
          ["orders", `Orders (${orders.length})`, Package],
        ] as const).map(([key, label, Icon]) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? "border-blue-600 text-blue-600 font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "jobs" && (
        <div className="space-y-4">
          {jobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs assigned to {contact.name}.</p>}

          {liveJobs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-green-700">
                  <PlayCircle className="size-4" />
                  Live ({liveJobs.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {liveJobs.map((j) => (
                  <JobRow key={j.id} job={j} />
                ))}
              </CardContent>
            </Card>
          )}

          {upcomingJobs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-blue-700">
                  <Clock className="size-4" />
                  Upcoming ({upcomingJobs.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {upcomingJobs.map((j) => (
                  <JobRow key={j.id} job={j} />
                ))}
              </CardContent>
            </Card>
          )}

          {completedJobs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="size-4" />
                  Completed ({completedJobs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {completedJobs.map((j) => (
                    <Link
                      key={j.id}
                      href={`/jobs/${j.id}`}
                      className="rounded-full border bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                    >
                      {j.name} · {plotLabel(j.plot)}
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "snags" && (
        <Card>
          <CardContent className="pt-4">
            {snags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No snags assigned.</p>
            ) : (
              <div className="space-y-2">
                {openSnags.length > 0 && (
                  <>
                    <p className="text-xs font-medium uppercase tracking-wider text-amber-700">Open ({openSnags.length})</p>
                    {openSnags.map((s) => (
                      <SnagRow key={s.id} snag={s} />
                    ))}
                  </>
                )}
                {resolvedSnags.length > 0 && (
                  <>
                    <p className="mt-3 text-xs font-medium uppercase tracking-wider text-slate-500">Resolved ({resolvedSnags.length})</p>
                    {resolvedSnags.map((s) => (
                      <SnagRow key={s.id} snag={s} />
                    ))}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "documents" && (
        <Card>
          <CardContent className="pt-4">
            {documents.length === 0 ? (
              <div className="text-center py-6">
                <FileText className="mx-auto mb-2 size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No RAMS or method statements uploaded yet.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload from the Contractor Comms screen on any site — they&apos;ll be visible to this contractor on their share link.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {documents.map((d) => {
                  const sizeKb = d.fileSize ? Math.round(d.fileSize / 1024) : null;
                  return (
                    <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-purple-50/50 px-3 py-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <FileText className="size-4 shrink-0 text-purple-600" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{d.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {d.category || "Document"}{sizeKb !== null ? ` · ${sizeKb} KB` : ""} · {format(parseISO(d.createdAt), "dd MMM yyyy")}
                            {d.uploadedBy ? ` · by ${d.uploadedBy.name}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {/* (May 2026 a11y audit #32 + #129) Icon-only
                            links get aria-label; the icon is hidden
                            from screen readers. */}
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
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "orders" && (
        <Card>
          <CardContent className="pt-4">
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders linked to this contact.</p>
            ) : (
              <div className="space-y-2">
                {orders.map((o) => (
                  <Link
                    key={o.id}
                    href={`/orders?orderId=${o.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-blue-50/50 hover:border-blue-200"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{o.supplier.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {o.itemsDescription || "—"}
                        {o.job && ` · ${plotLabel(o.job.plot)} · ${o.job.name}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <p>{format(parseISO(o.dateOfOrder), "dd MMM yyyy")}</p>
                      <Badge variant="outline" className="mt-0.5 text-[10px]">{o.status}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {/* Confirm-archive dialog */}
      {confirmDialogs}
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border p-2 hover:bg-slate-50">
      <div className="min-w-0 flex-1">
        <Link href={`/jobs/${job.id}`} className="text-sm font-medium text-blue-600 hover:underline">
          {job.name}
        </Link>
        <p className="text-xs text-muted-foreground">
          <Link href={`/sites/${job.plot.site.id}/plots/${job.plot.id}`} className="hover:underline hover:text-blue-600">
            {plotLabel(job.plot)}
          </Link>
          {" · "}
          <Link href={`/sites/${job.plot.site.id}`} className="hover:underline hover:text-blue-600">
            {job.plot.site.name}
          </Link>
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-2 text-right text-xs">
        {job.endDate && (
          <span className="text-muted-foreground">Due {format(parseISO(job.endDate), "dd MMM")}</span>
        )}
        <JobStatusBadge status={job.status as "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD"} />
      </div>
    </div>
  );
}

function SnagRow({ snag }: { snag: Snag }) {
  return (
    <Link
      href={`/sites/${snag.plot.site.id}?tab=snags&snagId=${snag.id}`}
      className="flex items-start gap-2 rounded-lg border p-2 hover:bg-amber-50/50 hover:border-amber-200"
    >
      <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium line-clamp-2">{snag.description}</p>
        <p className="text-xs text-muted-foreground">
          {plotLabel(snag.plot)} · {snag.plot.site.name} · {format(parseISO(snag.createdAt), "dd MMM yyyy")}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-1">
        <SnagPriorityBadge priority={snag.priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"} />
        <SnagStatusBadge status={snag.status as "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"} />
      </div>
    </Link>
  );
}

function ScoreStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="text-sm">
      <p className="text-[10px] uppercase tracking-wide text-blue-700">{label}</p>
      <p className="font-semibold text-blue-950">{value}</p>
      <p className="text-[10px] text-blue-700/70">{sub}</p>
    </div>
  );
}
