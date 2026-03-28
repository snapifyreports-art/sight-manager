"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  Mail,
  Phone,
  Building,
  Briefcase,
  AlertTriangle,
  Package,
  CircleDot,
  StickyNote,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

// ---------- Types ----------

interface ContractorDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  jobContractors: Array<{
    job: {
      id: string;
      name: string;
      status: string;
      startDate: string | null;
      endDate: string | null;
      plot: {
        id: string;
        name: string;
        site: { id: string; name: string };
      };
    };
  }>;
  snags: Array<{
    id: string;
    description: string;
    status: string;
    priority: string;
    createdAt: string;
    plot: { id: string; name: string; siteId: string } | null;
    job: { id: string; name: string } | null;
  }>;
  orders: Array<{
    id: string;
    orderDetails: string | null;
    status: string;
    dateOfOrder: string;
    supplier: { id: string; name: string };
    job: {
      id: string;
      name: string;
      plot: { name: string } | null;
    } | null;
  }>;
}

// ---------- Status Config ----------

const JOB_STATUS_CONFIG: Record<
  string,
  { label: string; bgColor: string; dotColor: string }
> = {
  NOT_STARTED: { label: "Not Started", bgColor: "bg-slate-400/10", dotColor: "text-slate-400" },
  IN_PROGRESS: { label: "In Progress", bgColor: "bg-amber-500/10", dotColor: "text-amber-500" },
  ON_HOLD: { label: "On Hold", bgColor: "bg-red-500/10", dotColor: "text-red-500" },
  COMPLETED: { label: "Completed", bgColor: "bg-green-500/10", dotColor: "text-green-500" },
};

const SNAG_PRIORITY_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  LOW: { label: "Low", variant: "secondary" },
  MEDIUM: { label: "Medium", variant: "outline" },
  HIGH: { label: "High", variant: "default" },
  CRITICAL: { label: "Critical", variant: "destructive" },
};

const SNAG_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  OPEN: { label: "Open", color: "text-red-500" },
  IN_PROGRESS: { label: "In Progress", color: "text-amber-500" },
  RESOLVED: { label: "Resolved", color: "text-green-500" },
  CLOSED: { label: "Closed", color: "text-slate-500" },
};

const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Pending", color: "text-slate-500" },
  ORDERED: { label: "Ordered", color: "text-blue-500" },
  CONFIRMED: { label: "Confirmed", color: "text-violet-500" },
  DELIVERED: { label: "Delivered", color: "text-green-600" },
  CANCELLED: { label: "Cancelled", color: "text-red-500" },
};

// ---------- Component ----------

export function ContractorDetailSheet({
  contractor,
  open,
  onOpenChange,
  onEditClick,
}: {
  contractor: ContractorDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditClick: () => void;
}) {
  // Group jobs by site
  const jobsBySite = useMemo(() => {
    if (!contractor) return [];
    const groups: Record<string, { siteId: string; siteName: string; jobs: typeof contractor.jobContractors }> = {};
    for (const jc of contractor.jobContractors) {
      const siteId = jc.job.plot.site.id;
      const siteName = jc.job.plot.site.name;
      if (!groups[siteId]) {
        groups[siteId] = { siteId, siteName, jobs: [] };
      }
      groups[siteId].jobs.push(jc);
    }
    return Object.values(groups);
  }, [contractor]);

  if (!contractor) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-left">{contractor.name}</SheetTitle>
          {contractor.company && (
            <SheetDescription className="text-left">
              {contractor.company}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="mt-4 space-y-6">
          {/* Contact Info */}
          <div className="flex flex-wrap gap-2">
            {contractor.email && (
              <a href={`mailto:${contractor.email}`}>
                <Button variant="outline" size="sm">
                  <Mail className="size-3.5" />
                  {contractor.email}
                </Button>
              </a>
            )}
            {contractor.phone && (
              <a href={`tel:${contractor.phone}`}>
                <Button variant="outline" size="sm">
                  <Phone className="size-3.5" />
                  {contractor.phone}
                </Button>
              </a>
            )}
            <Button variant="outline" size="sm" onClick={onEditClick}>
              Edit
            </Button>
          </div>

          {/* Jobs Section */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Briefcase className="size-4 text-muted-foreground" />
              Jobs
              <Badge variant="secondary" className="text-xs">
                {contractor.jobContractors.length}
              </Badge>
            </h3>

            {jobsBySite.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No jobs assigned
              </p>
            ) : (
              <div className="mt-2 space-y-4">
                {jobsBySite.map((group) => (
                  <div key={group.siteId}>
                    <Link
                      href={`/sites/${group.siteId}`}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {group.siteName}
                    </Link>
                    <div className="mt-1 space-y-1">
                      {group.jobs.map((jc) => {
                        const cfg = JOB_STATUS_CONFIG[jc.job.status] ?? JOB_STATUS_CONFIG.NOT_STARTED;
                        return (
                          <Link
                            key={jc.job.id}
                            href={`/jobs/${jc.job.id}`}
                            className="flex items-center justify-between rounded-md border p-2 transition-colors hover:bg-muted/50"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {jc.job.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {jc.job.plot.name}
                                {jc.job.startDate && (
                                  <> &middot; {format(new Date(jc.job.startDate), "d MMM")}</>
                                )}
                                {jc.job.endDate && (
                                  <> – {format(new Date(jc.job.endDate), "d MMM")}</>
                                )}
                              </p>
                            </div>
                            <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${cfg.bgColor}`}>
                              <CircleDot className={`size-2.5 ${cfg.dotColor}`} />
                              {cfg.label}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Snags Section */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="size-4 text-muted-foreground" />
              Snags
              <Badge variant="secondary" className="text-xs">
                {contractor.snags.length}
              </Badge>
            </h3>

            {contractor.snags.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No snags assigned
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                {contractor.snags.map((snag) => {
                  const priorityCfg = SNAG_PRIORITY_CONFIG[snag.priority] ?? SNAG_PRIORITY_CONFIG.MEDIUM;
                  const statusCfg = SNAG_STATUS_CONFIG[snag.status] ?? SNAG_STATUS_CONFIG.OPEN;
                  return (
                    <Link
                      key={snag.id}
                      href={snag.plot ? `/sites/${snag.plot.siteId}?tab=snags&snagId=${snag.id}` : "#"}
                      className="block rounded-md border p-2 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm">
                          {snag.description}
                        </p>
                        <Badge variant={priorityCfg.variant} className="shrink-0 text-xs">
                          {priorityCfg.label}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={`font-medium ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                        {snag.plot && <span>{snag.plot.name}</span>}
                        {snag.job && <span>&middot; {snag.job.name}</span>}
                        <span>&middot; {format(new Date(snag.createdAt), "d MMM")}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Orders Section */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Package className="size-4 text-muted-foreground" />
              Orders
              <Badge variant="secondary" className="text-xs">
                {contractor.orders.length}
              </Badge>
            </h3>

            {contractor.orders.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No orders linked
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                {contractor.orders.map((order) => {
                  const statusCfg = ORDER_STATUS_CONFIG[order.status] ?? ORDER_STATUS_CONFIG.PENDING;
                  return (
                    <Link
                      key={order.id}
                      href={`/orders?orderId=${order.id}`}
                      className="block rounded-md border p-2 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">
                          {order.supplier.name}
                        </p>
                        <span className={`text-xs font-medium ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        {order.job && (
                          <span>{order.job.name}</span>
                        )}
                        {order.job?.plot && (
                          <span>&middot; {order.job.plot.name}</span>
                        )}
                        <span>&middot; {format(new Date(order.dateOfOrder), "d MMM yyyy")}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes Section */}
          {contractor.notes && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <StickyNote className="size-4 text-muted-foreground" />
                Notes
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {contractor.notes}
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
