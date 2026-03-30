"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState, Suspense } from "react";
import {
  HardHat,
  LayoutDashboard,
  Building2,
  ShoppingCart,
  Package,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronDown,
  Menu,
  CalendarDays,
  FolderOpen,
  Footprints,
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
      { label: "Daily Brief",  tab: "daily-brief" },
      { label: "Programme",    tab: "programme" },
      { label: "Plots",        tab: "plots" },
      { label: "Snags",        tab: "snags" },
    ],
  },
  {
    label: "Site Reporting",
    icon: BarChart3,
    tabs: [
      { label: "Heatmap",        tab: "heatmap" },
      { label: "Weekly Report",  tab: "weekly-report" },
      { label: "Budget",         tab: "budget" },
      { label: "Cash Flow",      tab: "cash-flow" },
      { label: "Orders",         tab: "orders" },
      { label: "Delays",         tab: "delays" },
      { label: "Calendar",       tab: "calendar" },
      { label: "Site Log",       tab: "log" },
    ],
  },
  {
    label: "Site Admin",
    icon: FolderOpen,
    tabs: [
      { label: "Documents",     tab: "documents" },
      { label: "Critical Path", tab: "critical-path" },
      { label: "QR Codes",      tab: "qr-codes" },
    ],
  },
];

// Main nav items (site-contextual)
const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Daily Brief", href: "/daily-brief", icon: CalendarDays },
  { label: "Orders", href: "/orders", icon: ShoppingCart },
  { label: "Suppliers", href: "/suppliers", icon: Package },
  { label: "Contractors", href: "/contacts", icon: HardHat },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
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

function SidebarNav({ collapsed = false }: { collapsed?: boolean }) {
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

  const [selectedSiteId, setSelectedSiteId] = useState(siteIdFromPath || "");
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
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  // Fetch sites list for the picker
  useEffect(() => {
    fetch("/api/sites")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSites(data.map((s: { id: string; name: string; status: string }) => ({
            id: s.id,
            name: s.name,
            status: s.status,
          })));
        }
      })
      .catch(() => {});
  }, []);

  // Auto-select site from URL — either from /sites/[id] path or ?site= param
  useEffect(() => {
    if (siteIdFromPath) {
      setSelectedSiteId(siteIdFromPath);
    } else {
      setSelectedSiteId(searchParams.get("site") ?? "");
    }
  }, [siteIdFromPath, searchParams]);

  // Context-aware daily brief href
  const getNavHref = (href: string) => {
    if (href === "/daily-brief" && siteIdFromPath) {
      return `/daily-brief?site=${siteIdFromPath}`;
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
              setSelectedSiteId(id);
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

          {/* Site section groups — styled like regular nav, shown when site selected */}
          {!collapsed && selectedSiteId && SITE_TAB_GROUPS.map((group) => {
            const isOpen = openGroups.has(group.label);
            const hasActive = siteIdFromPath === selectedSiteId &&
              group.tabs.some((t) => t.tab === currentTab);
            return (
              <div key={group.label} className="relative">
                {hasActive && (
                  <div className="absolute left-0 h-6 w-[3px] rounded-r-full bg-blue-600 top-[10px]" />
                )}
                <button
                  onClick={() => toggleGroup(group.label)}
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
                  )} />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className={cn(
                    "size-3.5 shrink-0 transition-transform duration-200",
                    isOpen && "rotate-180"
                  )} />
                </button>
                {isOpen && (
                  <div className="mb-1 pl-9">
                    {group.tabs.map((t) => {
                      const href = `/sites/${selectedSiteId}?tab=${t.tab}`;
                      const isActive = siteIdFromPath === selectedSiteId && currentTab === t.tab;
                      return (
                        <Link
                          key={t.tab}
                          href={href}
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

          {/* Walkthrough — standalone prominent button when site selected */}
          {!collapsed && selectedSiteId && (() => {
            const isActive = pathname === `/sites/${siteIdFromPath}/walkthrough`;
            return (
              <div className="relative my-1">
                {isActive && (
                  <div className="absolute left-0 h-6 w-[3px] rounded-r-full bg-blue-600 top-[10px]" />
                )}
                <Link
                  href={`/sites/${selectedSiteId}/walkthrough`}
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
          {!collapsed && selectedSiteId && <div className="my-1 border-t border-border/40" />}

          {/* Main nav items — site-contextual */}
          {navItems.filter((item) => {
            const req = NAV_PERMISSION_MAP[item.href];
            if (!req) return true;
            const perms = (session?.user as { permissions?: string[] })?.permissions;
            return !perms || perms.includes(req);
          }).map((item) => renderNavItem(item, pathname, collapsed, getNavHref))}

          {/* Admin items — truly global, separated */}
          {!collapsed && <div className="my-1 border-t border-border/40" />}
          {adminNavItems.filter((item) => {
            const req = NAV_PERMISSION_MAP[item.href];
            if (!req) return true;
            const perms = (session?.user as { permissions?: string[] })?.permissions;
            return !perms || perms.includes(req);
          }).map((item) => renderNavItem(item, pathname, collapsed, getNavHref))}

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
  getNavHref: (href: string) => string
) {
  const isActive =
    pathname === item.href ||
    (item.href !== "/dashboard" && pathname.startsWith(item.href));
  const Icon = item.icon;

  const linkContent = (
    <Link
      href={getNavHref(item.href)}
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
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "hidden h-screen flex-col border-r border-border/50 bg-gradient-to-b from-white to-slate-50/80 transition-all duration-300 md:flex",
        collapsed ? "w-[60px]" : "w-[240px]"
      )}
    >
      <div className="relative flex-1 overflow-hidden">
        <Suspense fallback={null}>
          <SidebarNav collapsed={collapsed} />
        </Suspense>
        <Button
          variant="outline"
          size="icon-xs"
          className="absolute -right-3 top-[22px] z-10 rounded-full border bg-white shadow-sm hover:shadow-md transition-shadow"
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronLeft
            className={cn(
              "size-3 transition-transform",
              collapsed && "rotate-180"
            )}
          />
        </Button>
      </div>
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
          <SidebarNav />
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
        <select
          value={selectedSiteId}
          onChange={(e) => handleChange(e.target.value)}
          className="flex-1 bg-transparent text-[12px] text-foreground focus:outline-none"
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
