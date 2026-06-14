"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { WeatherIcon, WEATHER_CATEGORY_LABELS } from "@/components/reports/daily-brief/WeatherIcon";

/**
 * (May 2026 Keith strategic) Wall-cabin TV screen.
 *
 * Rotates between panels (on site now / starting today / deliveries /
 * tomorrow / site stats) every 12 seconds. Auto-refreshes the page
 * every 5 minutes so the data stays current without anyone touching
 * the remote. Pure read-only — no interactive elements at all so a
 * passer-by can't accidentally navigate away.
 *
 * (Jun 2026 Keith) Rebuilt from the bare first cut into a proper board:
 *   - white-label branding (logo, brand name, accent colour) instead of
 *     a hard-coded "Sight Manager" footer;
 *   - live weather + temperature beside the clock, plus a multi-day
 *     forecast strip on the look-ahead panel;
 *   - contractor shown on every job card with a colour-keyed avatar;
 *   - an "On site now" panel so a glance tells you who's working where.
 */

interface JobRow {
  id: string;
  name: string;
  plotLabel: string;
  contractor?: string | null;
}

interface DeliveryRow {
  id: string;
  items: string;
  supplier: string;
}

interface WeatherDay {
  date: string;
  category: string;
  tempMax: number;
  tempMin: number;
  weatherCode: number;
}

interface Branding {
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
}

interface Props {
  site: { id: string; name: string; location: string | null };
  brand: Branding;
  weather: { today: WeatherDay; tomorrow: WeatherDay | null; forecast: WeatherDay[] } | null;
  jobsOnSiteNow: JobRow[];
  jobsStartingToday: JobRow[];
  jobsInProgress: number;
  jobsStartingTomorrow: JobRow[];
  overdueCount: number;
  openSnags: number;
  deliveriesToday: DeliveryRow[];
  overdueDeliveriesCount: number;
  /** (Jun 2026 S2) Inspections tile on the stats panel. */
  inspectionsDueWeek?: number;
  inspectionsOverdue?: number;
}

const PANEL_MS = 12_000;
const REFRESH_MS = 5 * 60_000;

// (Jun 2026) Deterministic contractor avatar colours — same company always
// gets the same swatch so the eye can track a trade across the board.
const AVATAR_COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#ea580c",
  "#16a34a", "#0891b2", "#ca8a04", "#dc2626",
];
function colourFor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}
function initials(s: string): string {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1]![0] : "";
  return (first + second).toUpperCase();
}

export function LiveCabinScreen(props: Props) {
  // Panel set is dynamic — only show "On site now" when something is running
  // so quiet sites don't dwell on an empty board.
  const panels: string[] = [
    ...(props.jobsOnSiteNow.length > 0 ? ["now"] : []),
    "today",
    "deliveries",
    "tomorrow",
    "stats",
  ];

  const [panelIdx, setPanelIdx] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const panel = panels[panelIdx % panels.length] ?? "today";

  // Rotate panels.
  useEffect(() => {
    const t = setInterval(() => {
      setPanelIdx((i) => (i + 1) % panels.length);
    }, PANEL_MS);
    return () => clearInterval(t);
  }, [panels.length]);

  // Tick the clock once a second.
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  // (Jun 2026 Wave-4 S5) Keep server-rendered data current on a wall-mounted
  // TV. A repeating interval (not a one-shot setTimeout, which silently dies
  // if a reload is ever throttled in a backgrounded tab) PLUS a catch-up
  // reload when the tab becomes visible again after being hidden longer than
  // a refresh cycle — so a cabin that went to sleep refreshes the moment it
  // wakes rather than showing stale data until the next interval.
  useEffect(() => {
    const interval = setInterval(() => window.location.reload(), REFRESH_MS);
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > REFRESH_MS) {
        window.location.reload();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const brand = props.brand.primaryColor;

  return (
    <main
      className="relative flex min-h-screen flex-col overflow-hidden bg-slate-950 text-white"
      style={{ ["--brand" as string]: brand }}
    >
      {/* Brand-tinted ambient glow — premium feel without depending on the
          accent colour being pleasant against text. */}
      <div
        className="pointer-events-none absolute -top-40 right-[-10%] h-[36rem] w-[36rem] rounded-full opacity-20 blur-3xl"
        style={{ backgroundColor: brand }}
        aria-hidden
      />
      {/* Thin accent bar across the very top. */}
      <div className="h-1.5 w-full" style={{ backgroundColor: brand }} aria-hidden />

      <header className="relative flex items-center justify-between gap-6 border-b border-white/10 px-12 py-6">
        <div className="flex min-w-0 items-center gap-5">
          {props.brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={props.brand.logoUrl}
              alt={props.brand.brandName}
              className="h-14 w-auto max-w-[14rem] object-contain"
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-4xl font-black tracking-tight">
              {props.site.name}
            </h1>
            <p className="mt-1 flex items-center gap-2 text-lg text-white/60">
              <span
                className="inline-block size-2.5 animate-pulse rounded-full"
                style={{ backgroundColor: brand }}
                aria-hidden
              />
              {props.site.location ? props.site.location : props.brand.brandName}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-stretch gap-8">
          {props.weather && (
            <WeatherBlock today={props.weather.today} />
          )}
          <div className="flex flex-col items-end justify-center border-l border-white/10 pl-8">
            <p className="text-5xl font-bold tabular-nums leading-none">
              {format(clock, "HH:mm")}
            </p>
            <p className="mt-2 text-base text-white/60">
              {format(clock, "EEEE d MMMM")}
            </p>
          </div>
        </div>
      </header>

      <section className="relative flex flex-1 flex-col px-12 py-8">
        {panel === "now" && (
          <JobsPanel label="On site now" rows={props.jobsOnSiteNow} empty="No jobs in progress right now." accent={brand} live />
        )}
        {panel === "today" && (
          <JobsPanel label="Starting today" rows={props.jobsStartingToday} empty="No jobs starting today." accent={brand} />
        )}
        {panel === "deliveries" && (
          <DeliveriesPanel
            rows={props.deliveriesToday}
            overdue={props.overdueDeliveriesCount}
            accent={brand}
          />
        )}
        {panel === "tomorrow" && (
          <TomorrowPanel
            rows={props.jobsStartingTomorrow}
            forecast={props.weather?.forecast ?? []}
            accent={brand}
          />
        )}
        {panel === "stats" && (
          <StatsPanel
            inProgress={props.jobsInProgress}
            overdue={props.overdueCount}
            snags={props.openSnags}
            inspectionsDueWeek={props.inspectionsDueWeek ?? 0}
            inspectionsOverdue={props.inspectionsOverdue ?? 0}
            accent={brand}
          />
        )}
      </section>

      <footer className="relative flex items-center justify-between border-t border-white/10 px-12 py-4">
        <div className="flex items-center gap-2">
          {panels.map((p, i) => (
            <span
              key={p}
              className="h-2 rounded-full transition-all duration-300"
              style={
                i === panelIdx % panels.length
                  ? { width: "2.5rem", backgroundColor: brand }
                  : { width: "1rem", backgroundColor: "rgba(255,255,255,0.15)" }
              }
            />
          ))}
        </div>
        <p className="text-xs text-white/40">
          {props.brand.brandName} · live cabin · auto-refresh every {Math.round(REFRESH_MS / 60_000)} min
        </p>
      </footer>
    </main>
  );
}

function WeatherBlock({ today }: { today: WeatherDay }) {
  const label = WEATHER_CATEGORY_LABELS[today.category] ?? today.category;
  return (
    <div className="flex items-center gap-4">
      <WeatherIcon category={today.category} className="size-12 text-white/90" />
      <div className="leading-none">
        <p className="text-4xl font-bold tabular-nums">{Math.round(today.tempMax)}°</p>
        <p className="mt-1.5 text-sm text-white/60">
          {label} · L {Math.round(today.tempMin)}°
        </p>
      </div>
    </div>
  );
}

function PanelTitle({
  label,
  count,
  accent,
  live,
}: {
  label: string;
  count?: number | string;
  accent: string;
  live?: boolean;
}) {
  return (
    <h2 className="mb-6 flex items-center gap-4">
      <span className="h-7 w-1.5 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
      <span className="text-xs font-bold uppercase tracking-[0.3em] text-white/50">
        {label}
      </span>
      {count !== undefined && (
        <span className="rounded-full bg-white/10 px-3 py-0.5 text-sm font-semibold text-white/80">
          {count}
        </span>
      )}
      {live && (
        <span className="ml-auto flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-300">
          <span className="size-2 animate-pulse rounded-full bg-emerald-400" aria-hidden />
          Live
        </span>
      )}
    </h2>
  );
}

function ContractorChip({ name }: { name: string }) {
  return (
    <span className="mt-2 inline-flex items-center gap-2">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: colourFor(name) }}
        aria-hidden
      >
        {initials(name)}
      </span>
      <span className="text-base font-medium text-white/80">{name}</span>
    </span>
  );
}

function JobsPanel({
  label,
  rows,
  empty,
  accent,
  live,
}: {
  label: string;
  rows: JobRow[];
  empty: string;
  accent: string;
  live?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <PanelTitle label={label} count={rows.length} accent={accent} live={live} />
      {rows.length === 0 ? (
        <p className="text-2xl text-white/60">{empty}</p>
      ) : (
        <ul className="grid flex-1 auto-rows-min grid-cols-1 gap-3 md:grid-cols-2">
          {rows.slice(0, 12).map((j) => (
            <li
              key={j.id}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-2xl font-bold leading-tight">{j.name}</p>
                <span className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-sm font-semibold text-white/70">
                  {j.plotLabel}
                </span>
              </div>
              {j.contractor ? (
                <ContractorChip name={j.contractor} />
              ) : (
                <p className="mt-2 text-base italic text-white/40">No contractor assigned</p>
              )}
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
  accent,
}: {
  rows: DeliveryRow[];
  overdue: number;
  accent: string;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <PanelTitle label="Deliveries today" count={rows.length} accent={accent} />
      {overdue > 0 && (
        <p className="mb-4 inline-block w-fit rounded-md bg-red-500/20 px-3 py-1 text-base font-semibold text-red-200">
          {overdue} delivery{overdue === 1 ? "" : "ies"} overdue
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-2xl text-white/60">No deliveries expected today.</p>
      ) : (
        <ul className="grid auto-rows-min grid-cols-1 gap-3 md:grid-cols-2">
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

function TomorrowPanel({
  rows,
  forecast,
  accent,
}: {
  rows: JobRow[];
  forecast: WeatherDay[];
  accent: string;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <PanelTitle label="Tomorrow & the week ahead" count={rows.length} accent={accent} />
      {forecast.length > 0 && (
        <div className="mb-6 grid grid-cols-5 gap-3">
          {forecast.map((d, i) => (
            <ForecastCell key={d.date} day={d} isToday={i === 0} />
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-2xl text-white/60">No jobs scheduled tomorrow.</p>
      ) : (
        <ul className="grid auto-rows-min grid-cols-1 gap-3 md:grid-cols-2">
          {rows.slice(0, 12).map((j) => (
            <li
              key={j.id}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xl font-bold leading-tight">{j.name}</p>
                <span className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-sm font-semibold text-white/70">
                  {j.plotLabel}
                </span>
              </div>
              {j.contractor && <ContractorChip name={j.contractor} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ForecastCell({ day, isToday }: { day: WeatherDay; isToday: boolean }) {
  let weekday = "";
  try {
    weekday = isToday ? "Today" : format(parseISO(day.date), "EEE");
  } catch {
    weekday = day.date;
  }
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 py-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-white/50">{weekday}</p>
      <WeatherIcon category={day.category} className="size-8 text-white/90" />
      <p className="text-lg font-bold tabular-nums">
        {Math.round(day.tempMax)}°
        <span className="ml-1 text-sm font-medium text-white/50">{Math.round(day.tempMin)}°</span>
      </p>
    </div>
  );
}

function StatsPanel({
  inProgress,
  overdue,
  snags,
  inspectionsDueWeek,
  inspectionsOverdue,
  accent,
}: {
  inProgress: number;
  overdue: number;
  snags: number;
  inspectionsDueWeek: number;
  inspectionsOverdue: number;
  accent: string;
}) {
  // (Jun 2026 S2) Inspection tiles only when the site uses inspections —
  // a 3-tile layout stays clean for sites that don't.
  const showInspections = inspectionsDueWeek > 0 || inspectionsOverdue > 0;
  return (
    <div className="flex flex-1 flex-col">
      <PanelTitle label="Site at a glance" accent={accent} />
      <div className={`grid flex-1 items-center gap-6 ${showInspections ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"}`}>
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
        {showInspections && (
          <InspectionStat dueWeek={inspectionsDueWeek} overdue={inspectionsOverdue} />
        )}
      </div>
    </div>
  );
}

// (Jun 2026 Wave-4 S4) Show BOTH inspection numbers. Pre-fix the single tile
// flipped to the overdue count whenever anything was overdue — so on a busy
// site (almost always ≥1 overdue) the "this week" planning number, the thing
// that actually helps the team plan the day, never appeared. Now the
// this-week count stays the headline and overdue rides alongside it in red.
function InspectionStat({ dueWeek, overdue }: { dueWeek: number; overdue: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
      <p className="text-7xl font-black text-violet-300">{dueWeek}</p>
      <p className="mt-3 text-base text-white/60">
        Inspections this week
        {overdue > 0 && (
          <span className="ml-2 font-semibold text-red-300">· {overdue} overdue</span>
        )}
      </p>
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
