"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState, Suspense } from "react";
import {
  HardHat,
  LayoutDashboard,
  Building2,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronDown,
  Menu,
  FolderOpen,
  Footprints,
  ClipboardList,
  Scroll,
  FileBox,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_PERMISSION_MAP } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Site sub-nav tabs grouped into sections
// route?: string — if set, navigates to /sites/[id]/route instead of ?tab=tab
const SITE_TAB_GROUPS = [
  {
    label: "Manage Site",
    icon: HardHat,
    tabs: [
      { label: "Daily Brief",       tab: "daily-brief" },
      { label: "Programme",         tab: "programme" },
      { label: "Plots",             tab: "plots" },
      { label: "Orders",            tab: "orders" },
      { label: "Snags",             tab: "snags" },
      { label: "Contractor Comms",  tab: "contractor-comms" },
    ],
  },
  {
    label: "Site Reporting",
    icon: BarChart3,
    tabs: [
      { label: "Heatmap",        tab: "heatmap" },
      { label: "Weekly Report",  tab: "weekly-report" },
      { label: "Day Sheets",     tab: "day-sheets" },
      { label: "Budget",         tab: "budget" },
      { label: "Cash Flow",      tab: "cash-flow" },
      { label: "Delays",         tab: "delays" },
      { label: "Calendar",       tab: "calendar" },
      { label: "Site Log",       tab: "log" },
    ],
  },
  {
    label: "Site Admin",
    icon: FolderOpen,
    tabs: [
      { label: "Quants",         tab: "quants" },
      { label: "Drawings",       tab: "drawings" },
      { label: "Documents",      tab: "documents" },
      { label: "Photos",         tab: "photos" },
      { label: "Critical Path",  tab: "critical-path" },
      { label: "QR Codes",       tab: "qr-codes" },
      { label: "Customer Pages", tab: "customer-pages" },
      { label: "Compliance",     tab: "compliance" },
      { label: "Toolbox Talks",  tab: "toolbox" },
      { label: "NCRs",           tab: "ncrs" },
      { label: "Story",          tab: "story" },
      { label: "Site Closure",   tab: "site-closure" },
    ],
  },
];

// Main nav items (global — per-site views live under "Manage Site" up top).
// Keith Apr 2026: "daily brief and orders is repeated — they should live
// under manage site". Removed the duplicate global entries: per-site
// Daily Brief + Orders are already reachable via the Manage Site section
// above. The underlying pages (/daily-brief, /orders) still exist for
// deep-links but aren't in the sidebar.
const navItems = [
  { label: "Dashboard",     href: "/dashboard",   icon: LayoutDashboard },
  // (May 2026 audit #181) Cross-site exec view — at-risk counts +
  // progress bars per site, tenant-wide totals at the top.
  { label: "Portfolio",     href: "/portfolio",   icon: Building2 },
  // (May 2026 audit #111) Disambiguated from the per-site "Daily Brief"
  // tab inside Manage Site. This one's the cross-site digest.
  { label: "Daily Brief (all sites)", href: "/daily-brief", icon: ClipboardList },
  { label: "Suppliers",     href: "/suppliers?tab=suppliers",   icon: FileBox },
  { label: "Contractors",   href: "/suppliers?tab=contractors", icon: HardHat },
  { label: "Templates",     href: "/settings?tab=templates", icon: Layers },
  { label: "Analytics",     href: "/analytics",   icon: BarChart3 },
  { label: "Events Log",    href: "/events-log",  icon: Scroll },
];

// Truly global items — always at the bottom
const adminNavItems = [
  { label: "Settings", href: "/settings", icon: Settings },
];


function formatRole(role: string) {
  return role
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

function getInitials(name: string | null | undefined) {
  if (!name) return "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentTab = searchParams.get("tab") || "plots";
  const { data: session } = useSession();

  // Detect current site from URL
  const siteMatch = pathname.match(/^\/sites\/([^/]+)/);
  const siteIdFromPath = siteMatch?.[1];

  // Only navigate to /sites/[id] if already on a site page; everywhere else update ?site= in-place
  const isOnSitePage = !!siteIdFromPath;

  // Track a user-selected fallback for when the URL has no site (used for the
  // picker itself to have a controlled value). Seed it from localStorage at
  // mount via a lazy init so we never call setState inside an effect.
  const [fallbackSiteId, setFallbackSiteId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return localStorage.getItem("sight-manager-last-site") ?? ""; } catch { return ""; }
  });
  const [sites, setSites] = useState<{ id: string; name: string; status: string }[]>([]);

  // Which group label is open — auto-open the one containing the active tab
  const activeGroupLabel = SITE_TAB_GROUPS.find((g) =>
    g.tabs.some((t) => t.tab === currentTab)
  )?.label ?? null;
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(activeGroupLabel ? [activeGroupLabel] : [])
  );
  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });

  // Fetch sites list for the picker
  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const list = data.map((s: { id: string; name: string; status: string }) => ({
            id: s.id,
            name: s.name,
            status: s.status,
          }));
          setSites(list);
          // Clean up stale localStorage — if the stored "last site" no longer
          // exists (deleted or user lost access), forget it. Otherwise the
          // sidebar builds dead links and every click 404s.
          const ids = new Set(list.map((s) => s.id));
          setFallbackSiteId((prev) => {
            if (prev && !ids.has(prev)) {
              try { localStorage.removeItem("sight-manager-last-site"); } catch {}
              return "";
            }
            return prev;
          });
        }
      })
      .catch(() => {});
  }, []);

  // Derive the effective site directly (no effect needed) — prefer URL path,
  // then ?site= query param, then the localStorage-seeded fallback.
  const siteFromQuery = searchParams.get("site");
  const effectiveSiteId = siteIdFromPath || siteFromQuery || fallbackSiteId;
  // Only trust effectiveSiteId if it's in the fetched list (sites may have
  // been deleted since localStorage was written). `sites` starts empty before
  // the fetch resolves — during that window, trust effectiveSiteId optimistically
  // so nav doesn't flash-hide.
  const selectedSiteId =
    effectiveSiteId && (sites.length === 0 || sites.some((s) => s.id === effectiveSiteId))
      ? effectiveSiteId
      : "";

  // Persist any new siteId to localStorage so global pages remember it when
  // the user navigates away. This is a pure side-effect (localStorage write,
  // no setState) so the rule is satisfied. The fallbackSiteId doesn't need
  // updating here because `effectiveSiteId` already prefers URL/query.
  useEffect(() => {
    const toStore = siteIdFromPath || siteFromQuery;
    if (!toStore) return;
    try { localStorage.setItem("sight-manager-last-site", toStore); } catch {}
  }, [siteIdFromPath, siteFromQuery]);

  // Context-aware nav href — always pass site context to global pages
  const getNavHref = (href: string) => {
    const globalPages = ["/daily-brief", "/dashboard", "/analytics", "/events-log"];
    if (effectiveSiteId && globalPages.some((p) => href.startsWith(p))) {
      const sep = href.includes("?") ? "&" : "?";
      return `${href}${sep}site=${effectiveSiteId}`;
    }
    return href;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className={cn("flex h-14 items-center gap-3 border-b border-border/40 px-4", collapsed && "justify-center px-2")}>
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/25">
            <HardHat className="size-4" />
          </div>
          {!collapsed && (
            <span className="text-[15px] font-bold tracking-tight text-foreground">
              Sight Manager
            </span>
          )}
        </Link>
      </div>

      {/* Site navigation block */}
      {!collapsed && (
        <div className="border-b border-border/40 px-3 pb-3 pt-2">
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Site Navigation
          </p>
          <select
            value={selectedSiteId}
            onChange={(e) => {
              const id = e.target.value;
              setFallbackSiteId(id);
              if (isOnSitePage) {
                // On a site page, navigate to the same tab on the new site
                if (id) {
                  window.location.href = `/sites/${id}?tab=${currentTab}`;
                } else {
                  window.location.href = "/sites";
                }
              } else {
                // Everywhere else, update ?site= in-place (never navigate away)
                const params = new URLSearchParams(searchParams.toString());
                if (id) { params.set("site", id); } else { params.delete("site"); }
                router.push(`${pathname}?${params.toString()}`);
              }
            }}
            className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-[12px] text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">— All sites —</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.status === "ON_HOLD" ? " (on hold)" : s.status === "COMPLETED" ? " ✓" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Nav Links */}
      <ScrollArea className="flex-1 overflow-hidden py-2">
        <nav className={cn("flex flex-col gap-0.5", collapsed ? "px-2" : "px-3")}>

          {/* Site section groups — always rendered so users can see what's
              available. When no site is picked, the sub-items link to
              /sites?pickFor=<tab> and the sites page redirects to the chosen
              site's tab after picking. */}
          {!collapsed && SITE_TAB_GROUPS.map((group) => {
            const isOpen = openGroups.has(group.label);
            const hasActive = !!selectedSiteId && siteIdFromPath === selectedSiteId &&
              group.tabs.some((t) => t.tab === currentTab);
            return (
              <div key={group.label} className="relative">
                {hasActive && (
                  <div className="absolute left-0 h-6 w-[3px] rounded-r-full bg-blue-600 top-[10px]" />
                )}
                <button
                  onClick={() => toggleGroup(group.label)}
                  // (May 2026 a11y audit #123) aria-expanded so screen
                  // readers announce the collapsed/expanded state of
                  // the section. The chevron is decorative — its
                  // rotation is the visual mirror of aria-expanded.
                  aria-expanded={isOpen}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                    hasActive
                      ? "bg-gradient-to-r from-blue-600/[0.12] to-blue-600/[0.04] text-blue-700"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  <group.icon className={cn(
                    "size-[18px] shrink-0",
                    hasActive ? "text-blue-600" : "text-muted-foreground/70 group-hover:text-foreground"
                  )} aria-hidden="true" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className={cn(
                    "size-3.5 shrink-0 transition-transform duration-200",
                    isOpen && "rotate-180"
                  )} aria-hidden="true" />
                </button>
                {isOpen && (
                  <div className="mb-1 pl-9">
                    {group.tabs.map((t) => {
                      const href = selectedSiteId
                        ? `/sites/${selectedSiteId}?tab=${t.tab}`
                        : `/sites?pickFor=${t.tab}`;
                      const isActive = !!selectedSiteId && siteIdFromPath === selectedSiteId && currentTab === t.tab;
                      return (
                        <Link
                          key={t.tab}
                          href={href}
                          onClick={onNavigate}
                          // (May 2026 a11y audit #17) aria-current="page"
                          // tells screen readers which link is the current
                          // view. Pre-fix: state was visible by colour only.
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] transition-colors",
                            isActive
                              ? "font-medium text-blue-700"
                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          )}
                        >
                          {t.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Walkthrough — standalone prominent button. When no site is
              picked it sends the user to /sites?pickFor=walkthrough so the
              picker page can forward them to the chosen site's walkthrough. */}
          {!collapsed && (() => {
            const isActive = !!selectedSiteId && pathname === `/sites/${siteIdFromPath}/walkthrough`;
            const walkthroughHref = selectedSiteId
              ? `/sites/${selectedSiteId}/walkthrough`
              : `/sites?pickFor=walkthrough`;
            return (
              <div className="relative my-1">
                {isActive && (
                  <div className="absolute left-0 h-6 w-[3px] rounded-r-full bg-blue-600 top-[10px]" />
                )}
                <Link
                  href={walkthroughHref}
                  onClick={onNavigate}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-all duration-150",
                    isActive
                      ? "bg-gradient-to-r from-blue-600/[0.12] to-blue-600/[0.04] text-blue-700"
                      : "border border-dashed border-border/60 text-muted-foreground hover:border-blue-300 hover:bg-blue-50/60 hover:text-blue-700"
                  )}
                >
                  <Footprints className={cn(
                    "size-[18px] shrink-0",
                    isActive ? "text-blue-600" : "text-muted-foreground/70 group-hover:text-blue-600"
                  )} />
                  <span>Site Walkthrough</span>
                </Link>
              </div>
            );
          })()}

          {/* Divider before main nav */}
          {!collapsed && <div className="my-1 border-t border-border/40" />}

          {/* Main nav items — site-contextual */}
          {navItems.filter((item) => {
            const req = NAV_PERMISSION_MAP[item.href];
            if (!req) return true;
            const perms = (session?.user as { permissions?: string[] })?.permissions;
            return !perms || perms.includes(req);
          }).map((item) => renderNavItem(item, pathname, collapsed, getNavHref, onNavigate))}

          {/* Admin items — truly global, separated */}
          {!collapsed && <div className="my-1 border-t border-border/40" />}
          {adminNavItems.filter((item) => {
            const req = NAV_PERMISSION_MAP[item.href];
            if (!req) return true;
            const perms = (session?.user as { permissions?: string[] })?.permissions;
            return !perms || perms.includes(req);
          }).map((item) => renderNavItem(item, pathname, collapsed, getNavHref, onNavigate))}

          {/* Collapsed: Sites icon link */}
          {collapsed && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href="/sites"
                    className={cn(
                      "flex items-center justify-center rounded-lg px-2 py-2.5 transition-all duration-150",
                      siteIdFromPath
                        ? "bg-gradient-to-r from-blue-600/[0.12] to-blue-600/[0.04] text-blue-700"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    )}
                  />
                }
              >
                <Building2 className={cn("size-[18px]", siteIdFromPath ? "text-blue-600" : "text-muted-foreground/70")} />
              </TooltipTrigger>
              <TooltipContent side="right">Sites</TooltipContent>
            </Tooltip>
          )}
        </nav>
      </ScrollArea>

      {/* User Section */}
      <div className="border-t border-border/50 p-3">
        {session?.user && (
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/40",
              collapsed && "flex-col gap-2 p-1"
            )}
          >
            <Avatar size="sm">
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-500 text-[11px] font-semibold text-white">
                {getInitials(session.user.name)}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <span className="truncate text-[13px] font-semibold">
                  {session.user.name}
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {formatRole(session.user.role)}
                </span>
              </div>
            )}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => signOut({ callbackUrl: "/login" })}
                    />
                  }
                >
                  <LogOut className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Shared nav item renderer
function renderNavItem(
  item: { label: string; href: string; icon: React.ElementType },
  pathname: string,
  collapsed: boolean,
  getNavHref: (href: string) => string,
  onNavigate?: () => void
) {
  const isActive =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(item.href));
  const Icon = item.icon;

  const linkContent = (
    <Link
      href={getNavHref(item.href)}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
        isActive
          ? "bg-gradient-to-r from-blue-600/[0.12] to-blue-600/[0.04] text-blue-700 shadow-sm shadow-blue-600/5"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        collapsed && "justify-center px-2"
      )}
    >
      {isActive && !collapsed && (
        <div className="absolute left-0 h-6 w-[3px] rounded-r-full bg-blue-600" />
      )}
      <Icon className={cn(
        "size-[18px] shrink-0 transition-colors",
        isActive ? "text-blue-600" : "text-muted-foreground/70 group-hover:text-foreground"
      )} />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip key={item.href}>
        <TooltipTrigger render={linkContent} />
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return <div key={item.href} className="relative">{linkContent}</div>;
}

export function Sidebar() {
  // Persist across navigations — React useState resets on every page load, so
  // without localStorage the sidebar snapped back to expanded every click,
  // which felt like the collapse button was "broken".
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("sight-manager-sidebar-collapsed") === "1"; } catch { return false; }
  });
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("sight-manager-sidebar-collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "relative hidden h-screen flex-col border-r border-border/50 bg-gradient-to-b from-white to-slate-50/80 transition-all duration-300 md:flex",
        collapsed ? "w-[60px]" : "w-[240px]"
      )}
    >
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={null}>
          <SidebarNav collapsed={collapsed} />
        </Suspense>
      </div>
      {/* Collapse toggle — sits slightly outside the sidebar's right edge.
          z-30 + bg-white to guarantee it paints above the main content. */}
      <button
        type="button"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={toggleCollapsed}
        className="absolute -right-3 top-[22px] z-30 flex size-6 items-center justify-center rounded-full border border-border bg-white shadow-sm transition-shadow hover:shadow-md"
      >
        <ChevronLeft
          className={cn(
            "size-3 transition-transform duration-300",
            collapsed && "rotate-180"
          )}
        />
      </button>
    </aside>
  );
}

export function MobileSidebar() {
  const [open, setOpen] = useState(false);

  // Swipe right from left edge to open, swipe left to close
  useEffect(() => {
    let startX = 0;
    const onTouchStart = (e: TouchEvent) => { startX = e.touches[0].clientX; };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (dx > 60 && startX < 48) setOpen(true);
      if (dx < -60) setOpen(false);
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden" />
        }
      >
        <Menu className="size-5" />
        <span className="sr-only">Toggle menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-[260px] p-0" showCloseButton={false}>
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Suspense fallback={null}>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </Suspense>
      </SheetContent>
    </Sheet>
  );
}

export function MobileSiteBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);

  const siteMatch = pathname.match(/^\/sites\/([^/]+)/);
  const siteIdFromPath = siteMatch?.[1] ?? "";
  const siteParam = searchParams.get("site") ?? "";
  const selectedSiteId = siteIdFromPath || siteParam;

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSites(data); })
      .catch(() => {});
  }, []);

  const isOnSitePage = !!siteMatch?.[1];
  const currentTab = searchParams.get("tab") || "daily-brief";

  const handleChange = (id: string) => {
    if (isOnSitePage) {
      if (id) { window.location.href = `/sites/${id}?tab=${currentTab}`; }
      else { window.location.href = "/sites"; }
    } else {
      const params = new URLSearchParams(searchParams.toString());
      if (id) { params.set("site", id); } else { params.delete("site"); }
      router.push(`${pathname}?${params.toString()}`);
    }
  };

  return (
    <Suspense fallback={null}>
      <div className="flex items-center gap-2 border-b border-border/40 bg-slate-50 px-3 py-1.5 md:hidden">
        <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
        {/* (May 2026 a11y audit #128) Visible focus ring for keyboard
            users — pre-fix this <select> set focus:outline-none with no
            replacement, so tabbing onto it gave no visual feedback. The
            ring is on the <select> itself rather than the wrapping div
            so the focus indicator hugs the actual interactive element. */}
        <label htmlFor="mobile-site-picker" className="sr-only">
          Switch site
        </label>
        <select
          id="mobile-site-picker"
          value={selectedSiteId}
          onChange={(e) => handleChange(e.target.value)}
          className="flex-1 rounded bg-transparent text-[12px] text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
        >
          <option value="">— All sites —</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
    </Suspense>
  );
}
