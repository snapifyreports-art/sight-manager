"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

/**
 * (May 2026 Keith strategic) Wall-cabin TV screen.
 *
 * Rotates between four panels (today's jobs, deliveries, tomorrow,
 * site stats) every 12 seconds. Auto-refreshes the page every 5
 * minutes so the data stays current without anyone touching the
 * remote. Pure read-only — no interactive elements at all so a
 * passer-by can't accidentally navigate away.
 */

interface JobRow {
  id: string;
  name: string;
  plotLabel: string;
  contractor?: string | null;
}

interface TomorrowJob {
  id: string;
  name: string;
  plotLabel: string;
}

interface DeliveryRow {
  id: string;
  items: string;
  supplier: string;
}

interface Props {
  site: { id: string; name: string; location: string | null };
  jobsStartingToday: JobRow[];
  jobsInProgress: number;
  jobsStartingTomorrow: TomorrowJob[];
  overdueCount: number;
  openSnags: number;
  deliveriesToday: DeliveryRow[];
  overdueDeliveriesCount: number;
}

const PANEL_MS = 12_000;
const REFRESH_MS = 5 * 60_000;

const panels = ["today", "deliveries", "tomorrow", "stats"] as const;
type Panel = (typeof panels)[number];

export function LiveCabinScreen(props: Props) {
  const [panel, setPanel] = useState<Panel>("today");
  const [clock, setClock] = useState(() => new Date());

  // Rotate panels.
  useEffect(() => {
    const t = setInterval(() => {
      setPanel((p) => {
        const idx = panels.indexOf(p);
        return panels[(idx + 1) % panels.length]!;
      });
    }, PANEL_MS);
    return () => clearInterval(t);
  }, []);

  // Tick the clock once a second.
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  // Refresh the page so server-rendered data stays current.
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.reload();
    }, REFRESH_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-white">
      <header className="flex items-baseline justify-between gap-6 border-b border-white/10 px-12 py-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight">
            {props.site.name}
          </h1>
          {props.site.location && (
            <p className="mt-1 text-lg text-white/60">{props.site.location}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tabular-nums">
            {format(clock, "HH:mm")}
          </p>
          <p className="text-base text-white/60">
            {format(clock, "EEEE d MMMM")}
          </p>
        </div>
      </header>

      <section className="flex flex-1 flex-col px-12 py-8">
        {panel === "today" && <TodayPanel rows={props.jobsStartingToday} />}
        {panel === "deliveries" && (
          <DeliveriesPanel
            rows={props.deliveriesToday}
            overdue={props.overdueDeliveriesCount}
          />
        )}
        {panel === "tomorrow" && (
          <TomorrowPanel rows={props.jobsStartingTomorrow} />
        )}
        {panel === "stats" && (
          <StatsPanel
            inProgress={props.jobsInProgress}
            overdue={props.overdueCount}
            snags={props.openSnags}
          />
        )}
      </section>

      <footer className="flex items-center justify-between border-t border-white/10 px-12 py-4">
        <div className="flex items-center gap-2">
          {panels.map((p) => (
            <span
              key={p}
              className={`h-2 w-10 rounded-full ${
                p === panel ? "bg-blue-400" : "bg-white/15"
              }`}
            />
          ))}
        </div>
        <p className="text-xs text-white/40">
          Sight Manager · live cabin · auto-refresh in {Math.round(REFRESH_MS / 60_000)} min
        </p>
      </footer>
    </main>
  );
}

function PanelTitle({
  label,
  count,
}: {
  label: string;
  count?: number | string;
}) {
  return (
    <h2 className="mb-6 flex items-baseline gap-4 text-xs font-bold uppercase tracking-[0.3em] text-white/40">
      <span>{label}</span>
      {count !== undefined && (
        <span className="text-white/80">{count}</span>
      )}
    </h2>
  );
}

function TodayPanel({ rows }: { rows: JobRow[] }) {
  return (
    <div className="flex flex-1 flex-col">
      <PanelTitle label="Starting today" count={rows.length} />
      {rows.length === 0 ? (
        <p className="text-2xl text-white/60">No jobs starting today.</p>
      ) : (
        <ul className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
          {rows.slice(0, 12).map((j) => (
            <li
              key={j.id}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-4"
            >
              <p className="text-2xl font-bold leading-tight">{j.name}</p>
              <p className="mt-1 text-base text-white/60">
                {j.plotLabel}
                {j.contractor ? ` · ${j.contractor}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeliveriesPanel({
  rows,
  overdue,
}: {
  rows: DeliveryRow[];
  overdue: number;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <PanelTitle label="Deliveries today" count={rows.length} />
      {overdue > 0 && (
        <p className="mb-4 inline-block rounded-md bg-red-500/20 px-3 py-1 text-base font-semibold text-red-200">
          {overdue} delivery{overdue === 1 ? "" : "ies"} overdue
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-2xl text-white/60">No deliveries expected today.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.slice(0, 8).map((d) => (
            <li
              key={d.id}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-4"
            >
              <p className="text-xl font-bold leading-tight">{d.supplier}</p>
              <p className="mt-1 text-base text-white/60">{d.items}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TomorrowPanel({ rows }: { rows: TomorrowJob[] }) {
  return (
    <div className="flex flex-1 flex-col">
      <PanelTitle label="Tomorrow" count={rows.length} />
      {rows.length === 0 ? (
        <p className="text-2xl text-white/60">No jobs scheduled tomorrow.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.slice(0, 12).map((j) => (
            <li
              key={j.id}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-4"
            >
              <p className="text-xl font-bold leading-tight">{j.name}</p>
              <p className="mt-1 text-base text-white/60">{j.plotLabel}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatsPanel({
  inProgress,
  overdue,
  snags,
}: {
  inProgress: number;
  overdue: number;
  snags: number;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <PanelTitle label="Site at a glance" />
      <div className="grid flex-1 grid-cols-3 items-center gap-6">
        <Stat label="Jobs in progress" value={inProgress} accent="text-blue-300" />
        <Stat
          label="Jobs overdue"
          value={overdue}
          accent={overdue > 0 ? "text-red-300" : "text-emerald-300"}
        />
        <Stat
          label="Open snags"
          value={snags}
          accent={snags > 10 ? "text-amber-300" : "text-white"}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
      <p className={`text-7xl font-black ${accent}`}>{value}</p>
      <p className="mt-3 text-base text-white/60">{label}</p>
    </div>
  );
}
