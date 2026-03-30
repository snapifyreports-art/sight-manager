"use client";

import { useState, useEffect, useCallback } from "react";
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
  PlusCircle,
  LayoutGrid,
  UserCog,
  Bell,
  Server,
  ScrollText,
  Camera,
  AlertTriangle,
  ChevronDown,
  Shield,
  Truck,
  Calendar,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ---------- Types ----------

interface EventLogEntry {
  id: string;
  type: string;
  description: string;
  siteId: string | null;
  plotId: string | null;
  jobId: string | null;
  userId: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
  site: { id: string; name: string } | null;
  plot: { id: string; name: string; siteId: string } | null;
  job: { id: string; name: string; plotId: string } | null;
}

// ---------- Event Config ----------

const EVENT_TYPE_CONFIG: Record<
  string,
  {
    label: string;
    icon: typeof Play;
    iconBg: string;
    iconColor: string;
  }
> = {
  JOB_STARTED: {
    label: "Job Started",
    icon: Play,
    iconBg: "bg-green-500/15",
    iconColor: "text-green-600",
  },
  JOB_COMPLETED: {
    label: "Job Completed",
    icon: CheckCircle2,
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-600",
  },
  JOB_STOPPED: {
    label: "Job Stopped",
    icon: Pause,
    iconBg: "bg-red-500/15",
    iconColor: "text-red-600",
  },
  JOB_EDITED: {
    label: "Job Edited",
    icon: Pencil,
    iconBg: "bg-blue-500/15",
    iconColor: "text-blue-600",
  },
  JOB_SIGNED_OFF: {
    label: "Job Signed Off",
    icon: Shield,
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-600",
  },
  ORDER_PLACED: {
    label: "Order Placed",
    icon: Package,
    iconBg: "bg-violet-500/15",
    iconColor: "text-violet-600",
  },
  ORDER_DELIVERED: {
    label: "Order Delivered",
    icon: PackageCheck,
    iconBg: "bg-teal-500/15",
    iconColor: "text-teal-600",
  },
  ORDER_CANCELLED: {
    label: "Order Cancelled",
    icon: PackageX,
    iconBg: "bg-orange-500/15",
    iconColor: "text-orange-600",
  },
  DELIVERY_CONFIRMED: {
    label: "Delivery Confirmed",
    icon: Truck,
    iconBg: "bg-teal-500/15",
    iconColor: "text-teal-600",
  },
  PHOTO_UPLOADED: {
    label: "Photo Uploaded",
    icon: Camera,
    iconBg: "bg-pink-500/15",
    iconColor: "text-pink-600",
  },
  SCHEDULE_CASCADED: {
    label: "Schedule Cascaded",
    icon: Calendar,
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-600",
  },
  PLOT_CREATED: {
    label: "Plot Created",
    icon: PlusCircle,
    iconBg: "bg-cyan-500/15",
    iconColor: "text-cyan-600",
  },
  PLOT_UPDATED: {
    label: "Plot Updated",
    icon: LayoutGrid,
    iconBg: "bg-cyan-500/15",
    iconColor: "text-cyan-600",
  },
  SNAG_CREATED: {
    label: "Snag Raised",
    icon: AlertTriangle,
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-600",
  },
  SNAG_RESOLVED: {
    label: "Snag Resolved",
    icon: CheckCircle2,
    iconBg: "bg-green-500/15",
    iconColor: "text-green-600",
  },
  USER_ACTION: {
    label: "User Action",
    icon: UserCog,
    iconBg: "bg-sky-500/15",
    iconColor: "text-sky-600",
  },
  NOTIFICATION: {
    label: "Notification",
    icon: Bell,
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-600",
  },
  SYSTEM: {
    label: "System",
    icon: Server,
    iconBg: "bg-slate-500/15",
    iconColor: "text-slate-600",
  },
};

function getEventConfig(type: string) {
  return (
    EVENT_TYPE_CONFIG[type] ?? {
      label: type,
      icon: ScrollText,
      iconBg: "bg-slate-500/15",
      iconColor: "text-slate-600",
    }
  );
}

// ---------- Component ----------

export function PlotHistoryTab({ plotId }: { plotId: string }) {
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchEvents = useCallback(
    async (pageNum: number, append = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        const params = new URLSearchParams({
          plotId,
          page: String(pageNum),
          limit: "50",
        });
        const res = await fetch(`/api/events?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch events");

        const data = await res.json();
        if (append) {
          setEvents((prev) => [...prev, ...data.events]);
        } else {
          setEvents(data.events);
        }
        setHasMore(pageNum < data.totalPages);
      } catch (error) {
        console.error("Error fetching plot history:", error);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [plotId]
  );

  useEffect(() => {
    fetchEvents(1);
  }, [fetchEvents]);

  function handleLoadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchEvents(nextPage, true);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-16">
          <div className="text-sm text-muted-foreground">Loading history...</div>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 rounded-full bg-muted p-4">
            <ScrollText className="size-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">No history yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Activity will appear here as work progresses on this plot.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="relative">
            {/* Connecting line */}
            <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />

            <div className="space-y-0">
              {events.map((event, index) => {
                const config = getEventConfig(event.type);
                const Icon = config.icon;
                const isLast = index === events.length - 1 && !hasMore;

                return (
                  <div
                    key={event.id}
                    className={`relative flex gap-4 ${isLast ? "pb-0" : "pb-6"}`}
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
                        <span className="text-xs font-medium text-muted-foreground">
                          {config.label}
                        </span>
                        <span className="text-xs text-muted-foreground/70">
                          {formatDistanceToNow(new Date(event.createdAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>

                      <p className="mt-1 text-sm">{event.description}</p>

                      {/* Metadata row */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {event.user && (
                          <span className="font-medium">{event.user.name}</span>
                        )}
                        {event.job && (
                          <Link
                            href={`/jobs/${event.job.id}`}
                            className="hover:text-foreground hover:underline"
                          >
                            → {event.job.name}
                          </Link>
                        )}
                        {/* Snag events: link to snags tab */}
                        {(event.type === "SNAG_CREATED" || event.type === "SNAG_RESOLVED" || (event.type === "USER_ACTION" && event.description.toLowerCase().includes("snag"))) && event.plot && (
                          <Link
                            href={`/sites/${event.plot.siteId}?tab=snags`}
                            className="hover:text-foreground hover:underline"
                          >
                            → View Snags
                          </Link>
                        )}
                        {/* Order events: link to orders page */}
                        {(event.type === "ORDER_PLACED" || event.type === "ORDER_DELIVERED" || event.type === "ORDER_CANCELLED") && (
                          <Link
                            href="/orders"
                            className="hover:text-foreground hover:underline"
                          >
                            → View Orders
                          </Link>
                        )}
                        <span>
                          {format(new Date(event.createdAt), "d MMM yyyy, HH:mm")}
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

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              "Loading..."
            ) : (
              <>
                <ChevronDown className="mr-1 size-4" />
                Load more
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
