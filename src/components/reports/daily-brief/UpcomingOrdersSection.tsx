/**
 * Upcoming Orders card on the Daily Brief — PENDING orders not yet
 * placed, grouped by supplier + job so all plots that need the same
 * stage order go out as one email.
 *
 * (May 2026 sprint 7a) Extracted from DailySiteBrief.tsx. Action
 * dispatch:
 *   - Mail / "Send Order": opens the parent's useOrderEmail flow
 *     with the grouped order data pre-populated.
 *   - "Mark Sent" / "Place Order": fires the parent's group order
 *     action handler with `ORDERED` (the order moves into the
 *     Upcoming Deliveries section).
 *
 * The collapse state is OWNED by the parent — pass through the
 * `open` boolean and `onToggle` callback so URL-driven state still
 * works (the parent's `upcomingOrdersOpen` is the source of truth).
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  ChevronDown,
  Loader2,
  Mail,
  Package,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { JobActionStrip } from "@/components/reports/JobActionStrip";
import type { BriefData, OrderToPlace } from "./types";

export interface UpcomingOrdersSectionProps {
  data: BriefData;
  siteId: string;
  open: boolean;
  onToggle: () => void;
  groupedUpcomingOrders: OrderToPlace[][];
  isOrderPending: (id: string) => boolean;
  /** Open the parent's email-supplier flow with these grouped orders. */
  onSendGroup: (group: OrderToPlace[]) => void;
  /** Fire the parent's group order action handler. */
  onGroupOrderAction: (ids: string[], next: "ORDERED") => void;
}

export function UpcomingOrdersSection({
  data,
  open,
  onToggle,
  groupedUpcomingOrders,
  isOrderPending,
  onSendGroup,
  onGroupOrderAction,
}: UpcomingOrdersSectionProps) {
  if (data.upcomingOrders.length === 0) return null;

  return (
    <Card id="section-upcoming-orders">
      <CardHeader
        className="cursor-pointer select-none pb-2"
        onClick={onToggle}
      >
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShoppingCart className="size-4 text-slate-500" />
          Upcoming Orders ({groupedUpcomingOrders.length})
          <ChevronDown
            className={cn(
              "ml-auto size-4 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </CardTitle>
        <CardDescription className="text-xs">
          Orders scheduled for future placement — click to expand
        </CardDescription>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="space-y-2">
            {groupedUpcomingOrders.map((group) => {
              const o = group[0];
              const groupIds = group.map((g) => g.id);
              const anyPending = groupIds.some((id) => isOrderPending(id));
              const hasEmail = !!o.supplier.contactEmail;
              return (
                <div
                  key={`${o.supplier.id}__${o.job.name}`}
                  className="rounded border p-2 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/suppliers/${o.supplier.id}`}
                      className="truncate font-medium text-blue-600 hover:underline"
                    >
                      {o.supplier.name}
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {o.itemsDescription || "—"}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                    {o.dateOfOrder && (
                      <span>
                        Order by{" "}
                        <span className="font-medium text-purple-600">
                          {format(new Date(o.dateOfOrder), "dd MMM")}
                        </span>
                      </span>
                    )}
                    {o.expectedDeliveryDate && (
                      <span>
                        Delivery by{" "}
                        <span className="font-medium text-teal-600">
                          {format(new Date(o.expectedDeliveryDate), "dd MMM")}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    <Link
                      href={`/jobs/${o.job.id}`}
                      className="text-xs hover:text-blue-600 hover:underline"
                    >
                      {o.job.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">·</span>
                    {group.slice(0, 5).map((g) => (
                      <span
                        key={g.id}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                      >
                        {g.job.plot.plotNumber
                          ? `Plot ${g.job.plot.plotNumber}`
                          : g.job.plot.name}
                      </span>
                    ))}
                    {group.length > 5 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{group.length - 5} more
                      </span>
                    )}
                  </div>
                  <JobActionStrip>
                    {anyPending ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        {hasEmail && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 border-violet-200 px-2 text-xs text-violet-700 hover:bg-violet-50"
                            onClick={() => onSendGroup(group)}
                          >
                            <Mail className="mr-1 size-2.5" />
                            {group.length > 1
                              ? `Send (${group.length})`
                              : "Send Order"}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 border-blue-200 px-2 text-xs text-blue-700 hover:bg-blue-50"
                          onClick={() => onGroupOrderAction(groupIds, "ORDERED")}
                        >
                          <Package className="mr-1 size-2.5" />
                          {hasEmail ? "Mark Sent" : "Place Order"}
                        </Button>
                      </>
                    )}
                  </JobActionStrip>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
