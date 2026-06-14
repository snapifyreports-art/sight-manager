"use client";

import { useEffect, useState } from "react";

interface ThemeRow {
  theme: string;
  mentions: number;
}

interface TextThemesData {
  themes: ThemeRow[];
  totalTexts: number;
  sources: Array<{ source: string; count: number }>;
}

export function TextThemesWidget() {
  const [data, setData] = useState<TextThemesData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // (pattern sweep) Cancellation flag — avoid setState after unmount.
    let cancelled = false;
    fetch("/api/analytics/text-themes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !cancelled) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  // Render nothing on an empty install — no free-text scanned at all.
  if (!data || data.totalTexts === 0) return null;

  // Only themes that actually appeared; bars scale to the busiest theme.
  const present = data.themes.filter((t) => t.mentions > 0);
  if (present.length === 0) return null;
  const maxMentions = Math.max(1, ...present.map((t) => t.mentions));

  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="font-semibold">Recurring themes (free-text)</h3>
      <p className="text-xs text-muted-foreground">
        Scans delay notes, sign-off notes, NCRs, snags, defects, variations and
        toolbox talks by keyword to surface what keeps coming up.
      </p>
      <div className="mt-3 space-y-2">
        {present.map((t) => {
          const pct = (t.mentions / maxMentions) * 100;
          return (
            <div key={t.theme} className="flex items-center gap-2">
              <div className="w-32 shrink-0 truncate text-sm font-medium" title={t.theme}>
                {t.theme}
              </div>
              <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100">
                <div
                  className="h-full rounded bg-sky-500"
                  style={{ width: `${pct}%`, minWidth: t.mentions > 0 ? 2 : 0 }}
                />
              </div>
              <div className="w-10 shrink-0 text-right text-sm tabular-nums text-slate-600">
                {Number(t.mentions).toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Keyword-based across {Number(data.totalTexts).toLocaleString()} text{" "}
        {data.totalTexts === 1 ? "entry" : "entries"}.
      </p>
    </div>
  );
}
