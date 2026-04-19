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
import {
  JobStatusBadge,
  OrderStatusBadge,
  SnagStatusBadge,
  SnagPriorityBadge,
} from "@/components/shared/StatusBadge";

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

// Badges moved to @/components/shared/StatusBadge — single source of truth.

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
                      {group.jobs.map((jc) => (
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
                          <JobStatusBadge status={jc.job.status} />
                        </Link>
                      ))}
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
                {contractor.snags.map((snag) => (
                  <Link
                    key={snag.id}
                    href={snag.plot ? `/sites/${snag.plot.siteId}?tab=snags&snagId=${snag.id}` : "#"}
                    className="block rounded-md border p-2 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm">
                        {snag.description}
                      </p>
                      <SnagPriorityBadge priority={snag.priority} />
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <SnagStatusBadge status={snag.status} />
                      {snag.plot && <span>{snag.plot.name}</span>}
                      {snag.job && <span>&middot; {snag.job.name}</span>}
                      <span>&middot; {format(new Date(snag.createdAt), "d MMM")}</span>
                    </div>
                  </Link>
                ))}
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
                {contractor.orders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/orders?orderId=${order.id}`}
                      className="block rounded-md border p-2 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">
                          {order.supplier.name}
                        </p>
                        <OrderStatusBadge status={order.status} />
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
                ))}
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
