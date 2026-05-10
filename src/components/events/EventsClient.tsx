"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import {
  Play,
  CheckCircle2,
  Pause,
  Pencil,
  Package,
  PackageCheck,
  PackageX,
  Building2,
  PlusCircle,
  UserCog,
  Bell,
  Server,
  ScrollText,
  Search,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchErrorMessage } from "@/components/ui/toast";

// ---------- Types ----------

interface EventUser {
  id: string;
  name: string;
  email: string;
}

interface EventSite {
  id: string;
  name: string;
}

interface EventPlot {
  id: string;
  name: string;
  siteId: string;
}

interface EventJob {
  id: string;
  name: string;
  plotId: string;
}

interface EventLogEntry {
  id: string;
  type: string;
  description: string;
  siteId: string | null;
  plotId: string | null;
  jobId: string | null;
  userId: string | null;
  createdAt: string;
  user: EventUser | null;
  site: EventSite | null;
  plot: EventPlot | null;
  job: EventJob | null;
}

interface SiteOption {
  id: string;
  name: string;
}

interface PaginationInfo {
  total: number;
  page: number;
  totalPages: number;
}

// ---------- Constants ----------

const EVENT_TYPES = [
  "JOB_STARTED",
  "JOB_COMPLETED",
  "JOB_STOPPED",
  "JOB_SIGNED_OFF",
  "JOB_EDITED",
  "ORDER_PLACED",
  "ORDER_DELIVERED",
  "ORDER_CANCELLED",
  "DELIVERY_CONFIRMED",
  "SCHEDULE_CASCADED",
  "PHOTO_UPLOADED",
  "SNAG_CREATED",
  "SNAG_RESOLVED",
  "SITE_CREATED",
  "SITE_UPDATED",
  "PLOT_CREATED",
  "PLOT_UPDATED",
  "USER_ACTION",
  "NOTIFICATION",
  "SYSTEM",
] as const;

const EVENT_TYPE_CONFIG: Record<
  string,
  {
    label: string;
    icon: typeof Play;
    badgeVariant: "default" | "secondary" | "destructive" | "outline";
    iconBg: string;
    iconColor: string;
  }
> = {
  JOB_STARTED: {
    label: "Job Started",
    icon: Play,
    badgeVariant: "default",
    iconBg: "bg-green-500/15",
    iconColor: "text-green-600 dark:text-green-400",
  },
  JOB_COMPLETED: {
    label: "Job Completed",
    icon: CheckCircle2,
    badgeVariant: "default",
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  JOB_STOPPED: {
    label: "Job Stopped",
    icon: Pause,
    badgeVariant: "destructive",
    iconBg: "bg-red-500/15",
    iconColor: "text-red-600 dark:text-red-400",
  },
  JOB_EDITED: {
    label: "Job Edited",
    icon: Pencil,
    badgeVariant: "secondary",
    iconBg: "bg-blue-500/15",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  ORDER_PLACED: {
    label: "Order Placed",
    icon: Package,
    badgeVariant: "outline",
    iconBg: "bg-violet-500/15",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
  ORDER_DELIVERED: {
    label: "Order Delivered",
    icon: PackageCheck,
    badgeVariant: "default",
    iconBg: "bg-teal-500/15",
    iconColor: "text-teal-600 dark:text-teal-400",
  },
  ORDER_CANCELLED: {
    label: "Order Cancelled",
    icon: PackageX,
    badgeVariant: "destructive",
    iconBg: "bg-orange-500/15",
    iconColor: "text-orange-600 dark:text-orange-400",
  },
  SITE_CREATED: {
    label: "Site Created",
    icon: PlusCircle,
    badgeVariant: "default",
    iconBg: "bg-indigo-500/15",
    iconColor: "text-indigo-600 dark:text-indigo-400",
  },
  SITE_UPDATED: {
    label: "Site Updated",
    icon: Building2,
    badgeVariant: "secondary",
    iconBg: "bg-purple-500/15",
    iconColor: "text-purple-600 dark:text-purple-400",
  },
  PLOT_CREATED: {
    label: "Plot Created",
    icon: LayoutGrid,
    badgeVariant: "default",
    iconBg: "bg-cyan-500/15",
    iconColor: "text-cyan-600 dark:text-cyan-400",
  },
  PLOT_UPDATED: {
    label: "Plot Updated",
    icon: LayoutGrid,
    badgeVariant: "secondary",
    iconBg: "bg-cyan-500/15",
    iconColor: "text-cyan-600 dark:text-cyan-400",
  },
  USER_ACTION: {
    label: "User Action",
    icon: UserCog,
    badgeVariant: "secondary",
    iconBg: "bg-sky-500/15",
    iconColor: "text-sky-600 dark:text-sky-400",
  },
  NOTIFICATION: {
    label: "Notification",
    icon: Bell,
    badgeVariant: "outline",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  SYSTEM: {
    label: "System",
    icon: Server,
    badgeVariant: "outline",
    iconBg: "bg-slate-500/15",
    iconColor: "text-slate-600 dark:text-slate-400",
  },
  JOB_SIGNED_OFF: {
    label: "Job Signed Off",
    icon: CheckCircle2,
    badgeVariant: "default",
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  DELIVERY_CONFIRMED: {
    label: "Delivery Confirmed",
    icon: PackageCheck,
    badgeVariant: "default",
    iconBg: "bg-teal-500/15",
    iconColor: "text-teal-600 dark:text-teal-400",
  },
  SCHEDULE_CASCADED: {
    label: "Schedule Shifted",
    icon: ScrollText,
    badgeVariant: "secondary",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  PHOTO_UPLOADED: {
    label: "Photo Uploaded",
    icon: PlusCircle,
    badgeVariant: "outline",
    iconBg: "bg-pink-500/15",
    iconColor: "text-pink-600 dark:text-pink-400",
  },
  SNAG_CREATED: {
    label: "Snag Raised",
    icon: PlusCircle,
    badgeVariant: "destructive",
    iconBg: "bg-orange-500/15",
    iconColor: "text-orange-600 dark:text-orange-400",
  },
  SNAG_RESOLVED: {
    label: "Snag Resolved",
    icon: CheckCircle2,
    badgeVariant: "default",
    iconBg: "bg-green-500/15",
    iconColor: "text-green-600 dark:text-green-400",
  },
};

function getEventConfig(type: string) {
  return (
    EVENT_TYPE_CONFIG[type] ?? {
      label: type,
      icon: ScrollText,
      badgeVariant: "outline" as const,
      iconBg: "bg-slate-500/15",
      iconColor: "text-slate-600 dark:text-slate-400",
    }
  );
}

// ---------- Main Component ----------

export function EventsClient({
  initialEvents,
  initialPagination,
  sites,
}: {
  initialEvents: EventLogEntry[];
  initialPagination: PaginationInfo;
  sites: SiteOption[];
}) {
  const [events, setEvents] = useState(initialEvents);
  const [pagination, setPagination] = useState(initialPagination);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Determine if server filters are active (type/site require refetch)
  const hasServerFilters = typeFilter !== "all" || siteFilter !== "all";

  const fetchEvents = useCallback(
    async (page: number, type: string, siteId: string) => {
      setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "50");
        if (type !== "all") params.set("type", type);
        if (siteId !== "all") params.set("siteId", siteId);

        const res = await fetch(`/api/events?${params.toString()}`);
        if (!res.ok) {
          setLoadError(await fetchErrorMessage(res, "Failed to load events"));
          return;
        }

        const data = await res.json();
        setEvents(data.events);
        setPagination({
          total: data.total,
          page: data.page,
          totalPages: data.totalPages,
        });
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Network error loading events");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Refetch when server filters or page changes
  useEffect(() => {
    // Skip on initial render with no filters and page 1
    if (currentPage === 1 && !hasServerFilters) return;
    fetchEvents(currentPage, typeFilter, siteFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, typeFilter, siteFilter]);

  // Reset to page 1 when filters change
  function handleTypeChange(value: string | null) {
    if (value === null) return;
    setTypeFilter(value);
    setCurrentPage(1);
    if (value !== "all" || siteFilter !== "all") {
      fetchEvents(1, value, siteFilter);
    } else if (value === "all" && siteFilter === "all") {
      // Reset to initial
      setEvents(initialEvents);
      setPagination(initialPagination);
    }
  }

  function handleSiteChange(value: string | null) {
    if (value === null) return;
    setSiteFilter(value);
    setCurrentPage(1);
    if (typeFilter !== "all" || value !== "all") {
      fetchEvents(1, typeFilter, value);
    } else if (typeFilter === "all" && value === "all") {
      setEvents(initialEvents);
      setPagination(initialPagination);
    }
  }

  // Client-side search filtering on description
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const query = searchQuery.toLowerCase();
    return events.filter(
      (event) =>
        event.description.toLowerCase().includes(query) ||
        event.user?.name.toLowerCase().includes(query) ||
        event.site?.name.toLowerCase().includes(query) ||
        event.job?.name.toLowerCase().includes(query)
    );
  }, [events, searchQuery]);

  function handlePrevPage() {
    if (currentPage > 1) {
      setCurrentPage((p) => p - 1);
    }
  }

  function handleNextPage() {
    if (currentPage < pagination.totalPages) {
      setCurrentPage((p) => p + 1);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Events Log</h1>
        <p className="text-sm text-muted-foreground">
          Track all activity across sites, jobs, and orders
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              {/* (May 2026 a11y audit #19) Visually-hidden label +
                  type="search" — see ContactsClient pattern. */}
              <label htmlFor="events-search" className="sr-only">Search events</label>
              <Input
                id="events-search"
                type="search"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Type filter */}
            <Select value={typeFilter} onValueChange={handleTypeChange}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue>
                  {typeFilter === "all"
                    ? "All Types"
                    : getEventConfig(typeFilter).label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {getEventConfig(t).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Site filter */}
            <Select
              value={siteFilter}
              onValueChange={handleSiteChange}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue>
                  {siteFilter === "all"
                    ? "All Sites"
                    : sites.find((s) => s.id === siteFilter)?.name ??
                      "All Sites"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Failed to load events</p>
          <p className="text-xs">{loadError}</p>
          <button
            onClick={() => fetchEvents(currentPage, typeFilter, siteFilter)}
            className="mt-2 text-xs underline"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <div className="text-sm text-muted-foreground">
              Loading events...
            </div>
          </CardContent>
        </Card>
      ) : filteredEvents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <ScrollText className="size-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No events found</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {searchQuery || typeFilter !== "all" || siteFilter !== "all"
                ? "Try adjusting your filters to find what you're looking for."
                : "Events will appear here as activity happens across your sites and jobs."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <div className="relative">
              {/* Connecting line */}
              <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />

              <div className="space-y-0">
                {filteredEvents.map((event, index) => {
                  const config = getEventConfig(event.type);
                  const Icon = config.icon;
                  const isLast = index === filteredEvents.length - 1;

                  return (
                    <div
                      key={event.id}
                      className={`relative flex gap-4 pb-6 ${isLast ? "pb-0" : ""}`}
                    >
                      {/* Icon circle */}
                      <div
                        className={`relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full ${config.iconBg}`}
                      >
                        <Icon className={`size-4.5 ${config.iconColor}`} />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={config.badgeVariant}>
                            {config.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(event.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>

                        <p className="mt-1.5 text-sm">{event.description}</p>

                        {/* Metadata row */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {event.user && (
                            <span className="font-medium">
                              {event.user.name}
                            </span>
                          )}
                          {event.site && (
                            <Link
                              href={`/sites/${event.site.id}`}
                              className="hover:text-foreground hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {event.site.name}
                            </Link>
                          )}
                          {event.plot && (
                            <Link
                              href={`/sites/${event.plot.siteId}/plots/${event.plot.id}`}
                              className="hover:text-foreground hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {event.plot.name}
                            </Link>
                          )}
                          {event.job && (
                            <Link
                              href={`/jobs/${event.job.id}`}
                              className="hover:text-foreground hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {event.job.name}
                            </Link>
                          )}
                          <span>
                            {format(
                              new Date(event.createdAt),
                              "d MMM yyyy, HH:mm"
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing page {pagination.page} of {pagination.totalPages} ({pagination.total}{" "}
            {pagination.total === 1 ? "event" : "events"})
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={currentPage <= 1 || loading}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={currentPage >= pagination.totalPages || loading}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
