"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  MapPin,
  Briefcase,
  Building2,
  Package,
  Users,
  Bug,
  Clock,
  Loader2,
  Plus,
  Zap,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface SearchResults {
  sites: Array<{ id: string; name: string; address: string | null }>;
  plots: Array<{ id: string; plotNumber: string | null; name: string; siteId: string; siteName: string }>;
  jobs: Array<{ id: string; name: string; plotNumber: string | null; siteId: string; plotId: string }>;
  contacts: Array<{ id: string; name: string; company: string | null; type: string }>;
  orders: Array<{ id: string; description: string | null; supplierName: string; jobName: string }>;
  snags: Array<{ id: string; description: string; plotNumber: string | null; siteId: string; plotId: string }>;
}

const RECENT_KEY = "sight-manager-recent-searches";

function getRecent(): Array<{ label: string; href: string }> {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, 5);
  } catch {
    return [];
  }
}

function addRecent(label: string, href: string) {
  try {
    const items = getRecent().filter((r) => r.href !== href);
    items.unshift({ label, href });
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, 5)));
  } catch { /* non-critical */ }
}

export function SearchModal({
  open,
  onClose,
  siteId,
}: {
  open: boolean;
  onClose: () => void;
  siteId?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent] = useState(getRecent);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // (May 2026 audit #20) Removed bespoke Escape handler — the
  // design-system Dialog component handles ESC, focus trap,
  // backdrop click, aria-modal and return-focus correctly.

  const navigate = (label: string, href: string) => {
    addRecent(label, href);
    onClose();
    router.push(href);
  };

  // Navigation pages — always searched client-side, shown first
  const navPages = [
    { label: "Dashboard", href: "/dashboard", keywords: ["dashboard", "home", "overview"] },
    { label: "Daily Brief", href: "/daily-brief", keywords: ["daily", "brief", "today", "actions"] },
    { label: "Sites", href: "/sites", keywords: ["sites", "site", "projects"] },
    { label: "Programme", href: siteId ? `/sites/${siteId}?tab=programme` : "/sites", keywords: ["programme", "program", "gantt", "schedule", "timeline"] },
    { label: "Plots", href: siteId ? `/sites/${siteId}?tab=plots` : "/sites", keywords: ["plots", "plot", "houses", "units"] },
    { label: "Orders", href: "/orders", keywords: ["orders", "order", "materials", "deliveries", "delivery"] },
    { label: "Snags", href: siteId ? `/sites/${siteId}?tab=snags` : "/sites", keywords: ["snags", "snag", "defect", "issue", "punch"] },
    { label: "Contractor Comms", href: siteId ? `/sites/${siteId}?tab=contractor-comms` : "/sites", keywords: ["contractor", "comms", "communications", "trades"] },
    { label: "Suppliers & Contractors", href: "/suppliers", keywords: ["suppliers", "supplier", "contractor", "contacts", "trades"] },
    { label: "Analytics", href: "/analytics", keywords: ["analytics", "reports", "stats", "performance"] },
    { label: "Events Log", href: "/events-log", keywords: ["events", "event", "log", "activity", "history"] },
    { label: "Settings", href: "/settings", keywords: ["settings", "config", "preferences"] },
    { label: "Walkthrough", href: siteId ? `/sites/${siteId}/walkthrough` : "/sites", keywords: ["walkthrough", "walk", "inspection", "site visit"] },
  ];

  const matchedNavPages = query.length >= 1
    ? navPages.filter((p) => {
        const q = query.toLowerCase();
        return p.label.toLowerCase().includes(q) || p.keywords.some((k) => k.includes(q));
      })
    : [];

  // (May 2026 audit #134) Cmd-K action verbs. Pre-fix Cmd-K only
  // navigated — managers had to learn the menu structure to actually
  // create things. Now typing "snag", "order", "site", or starting
  // with ">" surfaces a Verbs section at the top with one-click
  // actions.
  const verbs: Array<{
    label: string;
    keywords: string[];
    href: string;
  }> = [
    {
      label: "Raise a snag",
      keywords: ["snag", "defect", "issue", "raise", "new snag", ">snag"],
      href: siteId ? `/sites/${siteId}?tab=snags&action=new` : "/sites?pickFor=snags",
    },
    {
      label: "Create a new site",
      keywords: ["site", "new site", "create site", ">site"],
      href: "/sites?action=new",
    },
    {
      label: "Add a plot",
      keywords: ["plot", "new plot", "add plot", ">plot"],
      href: siteId ? `/sites/${siteId}?tab=plots&action=new` : "/sites?pickFor=plots",
    },
    {
      label: "Create an order",
      keywords: ["order", "new order", "purchase", "po", ">order"],
      href: "/orders?action=new",
    },
    {
      label: "Add a contractor",
      keywords: ["contractor", "trade", "new contractor", ">contractor"],
      href: "/suppliers?tab=contractors&action=new",
    },
    {
      label: "Add a supplier",
      keywords: ["supplier", "new supplier", "vendor", ">supplier"],
      href: "/suppliers?tab=suppliers&action=new",
    },
    {
      label: "Open Daily Brief",
      keywords: ["brief", "daily", "today", ">brief"],
      href: siteId ? `/sites/${siteId}?tab=daily-brief` : "/daily-brief",
    },
    {
      label: "Site walkthrough",
      keywords: ["walk", "walkthrough", "inspection", "tour", ">walk"],
      href: siteId ? `/sites/${siteId}/walkthrough` : "/sites?pickFor=walkthrough",
    },
  ];

  const matchedVerbs = (() => {
    const raw = query.trim().toLowerCase();
    if (!raw) return [];
    // ">" prefix narrows the scope to verb keywords only.
    const q = raw.startsWith(">") ? raw : raw;
    return verbs.filter((v) =>
      v.keywords.some((k) => k.includes(q) || q.includes(k.replace(">", ""))),
    );
  })();

  const totalResults = (results
    ? results.sites.length + results.plots.length + results.jobs.length + results.contacts.length + results.orders.length + results.snags.length
    : 0) + matchedNavPages.length + matchedVerbs.length;

  const groups = results ? [
    { key: "sites", label: "Sites", icon: Building2, color: "text-blue-600", items: results.sites.map((s) => ({ id: s.id, label: s.name, sub: s.address, href: `/sites/${s.id}` })) },
    { key: "plots", label: "Plots", icon: MapPin, color: "text-green-600", items: results.plots.map((p) => ({ id: p.id, label: p.plotNumber ? `Plot ${p.plotNumber}` : p.name, sub: p.siteName, href: `/sites/${p.siteId}/plots/${p.id}` })) },
    { key: "jobs", label: "Jobs", icon: Briefcase, color: "text-indigo-600", items: results.jobs.map((j) => ({ id: j.id, label: j.name, sub: j.plotNumber ? `Plot ${j.plotNumber}` : undefined, href: `/jobs/${j.id}` })) },
    { key: "contacts", label: "Contacts", icon: Users, color: "text-orange-600", items: results.contacts.map((c) => ({ id: c.id, label: c.company ? `${c.company} — ${c.name}` : c.name, sub: c.type, href: `/contacts/${c.id}` })) },
    { key: "orders", label: "Orders", icon: Package, color: "text-violet-600", items: results.orders.map((o) => ({ id: o.id, label: o.description || "Order", sub: `${o.supplierName} · ${o.jobName}`, href: `/orders` })) },
    { key: "snags", label: "Snags", icon: Bug, color: "text-red-600", items: results.snags.map((s) => ({ id: s.id, label: s.description, sub: s.plotNumber ? `Plot ${s.plotNumber}` : undefined, href: `/sites/${s.siteId}?tab=snags&snagId=${s.id}` })) },
  ].filter((g) => g.items.length > 0) : [];

  return (
    // (May 2026 audit #20) Use design-system Dialog so we get focus
    // trap, ESC dismiss, return-focus, aria-modal, backdrop click,
    // proper labelling — all the things the hand-rolled overlay was
    // missing.
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        {/* Search input — Dialog provides its own close X in the corner */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Search className="size-5 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sites, plots, jobs, suppliers, snags..."
            aria-label="Search across sites, plots, jobs, suppliers, snags"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {/* Recent searches (when no query) */}
          {!query && recent.length > 0 && (
            <div className="p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Clock className="size-3" /> Recent
              </p>
              {recent.map((r, i) => (
                <button
                  key={i}
                  onClick={() => navigate(r.label, r.href)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <Clock className="size-3.5 text-muted-foreground" />
                  {r.label}
                </button>
              ))}
            </div>
          )}

          {/* No query hint */}
          {!query && recent.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Start typing to search across all sites, plots, jobs, suppliers, and snags
            </div>
          )}

          {/* (May 2026 audit #134) Verbs section — actions you can
              take, not just places to go. Renders above pages so the
              user spots them first when typing e.g. "snag". */}
          {matchedVerbs.length > 0 && (
            <div className="border-b">
              <p className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                <Zap className="size-3" aria-hidden="true" />
                Actions ({matchedVerbs.length})
              </p>
              {matchedVerbs.map((v) => (
                <button
                  key={v.label}
                  onClick={() => navigate(v.label, v.href)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-accent"
                >
                  <Plus className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{v.label}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Navigation pages — always shown first */}
          {matchedNavPages.length > 0 && (
            <div className="border-b">
              <p className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                <Search className="size-3" />
                Pages ({matchedNavPages.length})
              </p>
              {matchedNavPages.map((page) => (
                <button
                  key={page.href}
                  onClick={() => navigate(page.label, page.href)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-accent"
                >
                  <Search className="size-4 shrink-0 text-slate-500" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{page.label}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* No results */}
          {query.length >= 2 && !loading && totalResults === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {/* Grouped results */}
          {groups.map((group) => (
            <div key={group.key} className="border-b last:border-b-0">
              <p className={`flex items-center gap-1.5 px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider ${group.color}`}>
                <group.icon className="size-3" />
                {group.label} ({group.items.length})
              </p>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(item.label, item.href)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-accent"
                >
                  <group.icon className={`size-4 shrink-0 ${group.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.label}</p>
                    {item.sub && <p className="truncate text-xs text-muted-foreground">{item.sub}</p>}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-4 py-2 text-[10px] text-muted-foreground">
          <span>Type to search</span>
          <span className="rounded border px-1.5 py-0.5 font-mono">ESC</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
