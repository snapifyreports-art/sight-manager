"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Users, Phone, Mail } from "lucide-react";

/**
 * (May 2026 Keith request) Who's expected on site today.
 *
 * v1 backs on JobContractor + active-jobs-overlapping-today, grouped
 * by contractor. v2 (not yet wired) will fold in actual QR sign-ins
 * and RAMS / insurance expiry warnings — needs a new SiteSignIn
 * model. Surfacing the derived "expected" list first means the page
 * is useful immediately on every site's existing programme data.
 */

interface OnSiteJob {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  plot: { id: string; plotNumber: string | null; name: string };
}

interface OnSiteContractor {
  contactId: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  jobsCount: number;
  plotsCount: number;
  jobs: OnSiteJob[];
}

interface OnSiteData {
  date: string;
  totalContractors: number;
  totalJobs: number;
  expected: OnSiteContractor[];
}

export function SiteOnSiteToday({ siteId }: { siteId: string }) {
  const [data, setData] = useState<OnSiteData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sites/${siteId}/on-site-today`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-6 w-64 rounded bg-slate-200" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border bg-white p-4">
            <div className="mb-2 h-5 w-48 rounded bg-slate-100" />
            <div className="mb-3 h-3 w-32 rounded bg-slate-100" />
            <div className="space-y-1">
              <div className="h-3 w-3/4 rounded bg-slate-100" />
              <div className="h-3 w-1/2 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
        Couldn&rsquo;t load today&rsquo;s expected contractors.
      </div>
    );
  }

  if (data.expected.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
        No contractors expected on site today. ✓
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border bg-white p-4">
        <Users className="size-5 text-slate-600" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">
            Expected on site today
          </p>
          <p className="text-xs text-muted-foreground">
            {data.totalContractors} contractor
            {data.totalContractors === 1 ? "" : "s"} · {data.totalJobs} active
            job{data.totalJobs === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* v1 caveat banner — make it clear this is derived data so a
          manager doesn't mistake it for actual sign-ins. */}
      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        Derived from active programme jobs. QR sign-in tracking + RAMS /
        insurance expiry warnings ship in a follow-up — for now this is the
        list of who <em>should</em> be here, not who has signed in.
      </div>

      <div className="space-y-3">
        {data.expected.map((c) => (
          <article
            key={c.contactId}
            className="rounded-xl border bg-white p-4 shadow-sm"
          >
            <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-slate-900">
                  {c.company ?? c.name}
                </h3>
                {c.company && (
                  <p className="text-xs text-muted-foreground">{c.name}</p>
                )}
              </div>
              <div className="shrink-0 text-xs font-medium text-slate-700">
                {c.jobsCount} job{c.jobsCount === 1 ? "" : "s"} ·{" "}
                {c.plotsCount} plot{c.plotsCount === 1 ? "" : "s"}
              </div>
            </header>
            <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              {c.phone && (
                <a
                  href={`tel:${c.phone}`}
                  className="inline-flex items-center gap-1 hover:text-blue-700"
                >
                  <Phone className="size-3" /> {c.phone}
                </a>
              )}
              {c.email && (
                <a
                  href={`mailto:${c.email}`}
                  className="inline-flex items-center gap-1 hover:text-blue-700"
                >
                  <Mail className="size-3" /> {c.email}
                </a>
              )}
            </div>
            <ul className="divide-y rounded-md border">
              {c.jobs.map((j) => {
                const plotLbl = j.plot.plotNumber
                  ? `Plot ${j.plot.plotNumber}`
                  : j.plot.name;
                return (
                  <li
                    key={j.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                  >
                    <Link
                      href={`/jobs/${j.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {j.name}
                    </Link>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Link
                        href={`/plots/${j.plot.id}`}
                        className="hover:text-blue-700 hover:underline"
                      >
                        {plotLbl}
                      </Link>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          j.status === "IN_PROGRESS"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {j.status === "IN_PROGRESS" ? "In progress" : "Not started"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
