import { prisma } from "@/lib/prisma";
import { CheckCircle2, Circle, Hammer, Home as HomeIcon, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Customer-facing plot progress page. Public, no auth.
 *
 * Hard rules — read /api/progress/[token]/route.ts before changing:
 *   - NO DATES rendered to the customer (no startDate, endDate,
 *     reservation, exchange, legal, move-in)
 *   - NO snags, NO orders, NO materials, NO contractors / suppliers
 *   - Photos: only those ticked sharedWithCustomer=true
 *   - Top-level stages only — never leaf-level detail
 *   - Tone: positive, excitement-building. The customer should feel
 *     like the builder cares enough to keep them in the loop.
 *
 * Server-rendered, mobile-first. No client JS unless we add a gallery
 * lightbox later.
 */

type Status = "completed" | "in_progress" | "upcoming";
type Milestone = { id: string; name: string; status: Status };
type JournalEntry = { id: string; body: string; createdAt: Date };
type Photo = { id: string; url: string; caption: string | null; createdAt: Date };

// Customer-friendly status — three states only. Aggregates child
// statuses up to the parent. Mirrors logic in the API route's
// aggregateStatus() so the page can be SSR'd from the same data.
function aggregateStatus(statuses: string[]): Status {
  if (statuses.length === 0) return "upcoming";
  if (statuses.every((s) => s === "COMPLETED")) return "completed";
  if (statuses.some((s) => s === "IN_PROGRESS" || s === "COMPLETED")) return "in_progress";
  return "upcoming";
}

// Relative descriptors so we never write a hard date to the customer.
// Buckets are intentionally fuzzy ("a few days ago", "last week") —
// less precise = less anxiety / contractual reading.
function relativeWhen(date: Date): string {
  const ms = Date.now() - date.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (ms < day) return "today";
  if (ms < 2 * day) return "yesterday";
  if (ms < 7 * day) return `${Math.floor(ms / day)} days ago`;
  if (ms < 14 * day) return "last week";
  if (ms < 30 * day) return `${Math.floor(ms / (7 * day))} weeks ago`;
  if (ms < 60 * day) return "last month";
  return `${Math.floor(ms / (30 * day))} months ago`;
}

function NotFoundCard({ reason }: { reason: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white p-4">
      <div className="max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
        <AlertCircle className="mx-auto size-12 text-amber-400" />
        <h1 className="mt-4 text-xl font-semibold text-slate-800">{reason}</h1>
        <p className="mt-2 text-sm text-slate-500">
          Please get in touch with the site team if you think this is a mistake.
        </p>
      </div>
    </div>
  );
}

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return <NotFoundCard reason="This link isn't active" />;
  }

  // Same narrow select as /api/progress/[token]/route.ts. Server
  // component pulls direct so the customer's first paint isn't
  // gated on a client fetch.
  const plot = await prisma.plot.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      plotNumber: true,
      houseType: true,
      shareEnabled: true,
      site: { select: { name: true } },
      jobs: {
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          status: true,
          children: { select: { status: true } },
        },
      },
      journalEntries: {
        orderBy: { createdAt: "desc" },
        select: { id: true, body: true, createdAt: true },
      },
    },
  });

  if (!plot || !plot.shareEnabled) {
    return <NotFoundCard reason="This link isn't active" />;
  }

  const photos = await prisma.jobPhoto.findMany({
    where: {
      sharedWithCustomer: true,
      job: { plotId: plot.id },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, url: true, caption: true, createdAt: true },
  });

  const milestones: Milestone[] = plot.jobs.map((j) => ({
    id: j.id,
    name: j.name,
    status: aggregateStatus(
      j.children.length > 0 ? j.children.map((c) => c.status) : [j.status],
    ),
  }));

  const completed = milestones.filter((m) => m.status === "completed").length;
  const inProgress = milestones.find((m) => m.status === "in_progress");
  const total = milestones.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        {/* ─── Hero ─── */}
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 shadow-sm">
            <HomeIcon className="size-8" />
          </div>
          <p className="text-sm font-medium uppercase tracking-wider text-blue-600">
            Your new home
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 sm:text-4xl">
            Plot {plot.plotNumber || "—"}
          </h1>
          {plot.houseType && (
            <p className="mt-1 text-base text-slate-600">{plot.houseType}</p>
          )}
          <p className="mt-1 text-sm text-slate-500">at {plot.site.name}</p>
        </header>

        {/* ─── Progress summary ─── */}
        <section className="mb-8 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Build progress
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {completed} of {total} stages complete
              </p>
              {inProgress && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-blue-600">
                  <Hammer className="size-4" />
                  Currently: {inProgress.name}
                </p>
              )}
            </div>
            <div className="relative size-20 shrink-0">
              <svg className="size-20 -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r="32"
                  stroke="currentColor"
                  strokeWidth="6"
                  fill="none"
                  className="text-slate-100"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="32"
                  stroke="currentColor"
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 32}
                  strokeDashoffset={2 * Math.PI * 32 * (1 - pct / 100)}
                  className="text-blue-500 transition-[stroke-dashoffset] duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-base font-bold text-slate-900">
                {pct}%
              </div>
            </div>
          </div>
        </section>

        {/* ─── Milestones ─── */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Milestones
          </h2>
          <ol className="space-y-2">
            {milestones.map((m) => (
              <MilestoneRow key={m.id} milestone={m} />
            ))}
          </ol>
        </section>

        {/* ─── Story feed ─── */}
        {plot.journalEntries.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Latest updates
            </h2>
            <div className="space-y-3">
              {plot.journalEntries.map((e) => (
                <JournalCard key={e.id} entry={e} />
              ))}
            </div>
          </section>
        )}

        {/* ─── Photo gallery ─── */}
        {photos.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              From the site
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((p) => (
                <PhotoCard key={p.id} photo={p} />
              ))}
            </div>
          </section>
        )}

        {/* ─── Empty state when nothing yet ─── */}
        {plot.journalEntries.length === 0 && photos.length === 0 && completed === 0 && !inProgress && (
          <section className="rounded-2xl border border-dashed bg-white p-8 text-center">
            <Hammer className="mx-auto size-10 text-slate-300" />
            <p className="mt-4 text-base font-medium text-slate-700">
              Your build hasn't started yet
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Updates will appear here as soon as work begins on site.
            </p>
          </section>
        )}

        <footer className="mt-12 border-t pt-6 text-center text-xs text-slate-400">
          We'll keep this page up to date as your home takes shape.
        </footer>
      </div>
    </div>
  );
}

function MilestoneRow({ milestone }: { milestone: Milestone }) {
  const config = {
    completed: {
      Icon: CheckCircle2,
      iconClass: "text-green-500",
      bgClass: "bg-green-50 border-green-200",
      labelClass: "text-green-700",
      label: "Done",
    },
    in_progress: {
      Icon: Hammer,
      iconClass: "text-blue-500",
      bgClass: "bg-blue-50 border-blue-200",
      labelClass: "text-blue-700",
      label: "In progress",
    },
    upcoming: {
      Icon: Circle,
      iconClass: "text-slate-300",
      bgClass: "bg-white border-slate-200",
      labelClass: "text-slate-400",
      label: "Coming up",
    },
  }[milestone.status];

  return (
    <li
      className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${config.bgClass}`}
    >
      <config.Icon className={`size-6 shrink-0 ${config.iconClass}`} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900 truncate">{milestone.name}</p>
      </div>
      <span className={`text-xs font-medium uppercase tracking-wider ${config.labelClass}`}>
        {config.label}
      </span>
    </li>
  );
}

function JournalCard({ entry }: { entry: JournalEntry }) {
  return (
    <article className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
        {relativeWhen(entry.createdAt)}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
        {entry.body}
      </p>
    </article>
  );
}

function PhotoCard({ photo }: { photo: Photo }) {
  return (
    <figure className="overflow-hidden rounded-xl border bg-white shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={photo.caption ?? "Construction photo"}
        className="aspect-square w-full object-cover"
        loading="lazy"
      />
      {photo.caption && (
        <figcaption className="p-2 text-xs text-slate-600">
          {photo.caption}
        </figcaption>
      )}
    </figure>
  );
}
