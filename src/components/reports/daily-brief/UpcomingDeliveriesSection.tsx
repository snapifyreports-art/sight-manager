/**
 * Upcoming deliveries card on the Daily Brief — ORDERED orders that
 * haven't yet been marked DELIVERED. Grouped by expected-delivery
 * date (outer) then by supplier+job (inner), per Keith's "all orders
 * for the same day stacked into one" model (Apr 2026).
 *
 * (May 2026 sprint 7a) Extracted from DailySiteBrief.tsx. The inline
 * "Mark Received" button calls the parent's order-action handler;
 * the date input persists directly to /api/orders/:id and asks the
 * parent to bump its refresh key.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Truck,
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
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import type { BriefData, UpcomingDelivery } from "./types";

export interface UpcomingDeliveriesSectionProps {
  data: BriefData;
  openSections: Set<string>;
  toggleSection: (key: string) => void;
  isOrderPending: (id: string) => boolean;
  onOrderAction: (id: string, next: "DELIVERED") => void;
  onRefresh: () => void;
}

export function UpcomingDeliveriesSection({
  data,
  openSections,
  toggleSection,
  isOrderPending,
  onOrderAction,
  onRefresh,
}: UpcomingDeliveriesSectionProps) {
  const toast = useToast();
  return (
    <Card id="section-upcoming-deliveries">
      <CardHeader
        className="cursor-pointer select-none pb-2"
        onClick={() => toggleSection("upcoming-deliveries")}
      >
        <CardTitle className="flex items-center gap-2 text-sm">
          <Truck className="size-4 text-blue-600" />
          Upcoming Deliveries ({data.upcomingDeliveries?.length || 0})
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 shrink-0 transition-transform duration-200",
              openSections.has("upcoming-deliveries") && "rotate-180",
            )}
          />
        </CardTitle>
        <CardDescription className="text-xs">
          Orders sent to suppliers — awaiting delivery
        </CardDescription>
      </CardHeader>
      {openSections.has("upcoming-deliveries") && (
        <CardContent>
          {!data.upcomingDeliveries || data.upcomingDeliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No upcoming deliveries
            </p>
          ) : (
            <div className="space-y-3">
              {(() => {
                // Outer grouping by expected delivery date, then inner
                // grouping by supplier + job (same supplier for same
                // stage across plots = one email).
                const byDate = new Map<string, UpcomingDelivery[]>();
                for (const d of data.upcomingDeliveries!) {
                  const key = d.expectedDeliveryDate
                    ? format(new Date(d.expectedDeliveryDate), "yyyy-MM-dd")
                    : "unscheduled";
                  const existing = byDate.get(key) ?? [];
                  existing.push(d);
                  byDate.set(key, existing);
                }
                const sortedDates = Array.from(byDate.keys()).sort();
                return sortedDates.map((dateKey) => {
                  const deliveries = byDate.get(dateKey)!;
                  const dayLabel =
                    dateKey === "unscheduled"
                      ? "No date set"
                      : format(new Date(dateKey), "EEE d MMM");
                  const subGrouped = new Map<string, UpcomingDelivery[]>();
                  for (const d of deliveries) {
                    const key = `${d.supplier.id}__${d.job.name}`;
                    const existing = subGrouped.get(key) ?? [];
                    existing.push(d);
                    subGrouped.set(key, existing);
                  }
                  const subGroups = Array.from(subGrouped.values());
                  return (
                    <details
                      key={dateKey}
                      className="group rounded-lg border bg-slate-50/50"
                      open
                    >
                      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-blue-700 [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center gap-2">
                          <Truck className="size-4" />
                          {dayLabel}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {deliveries.length} deliver
                          {deliveries.length === 1 ? "y" : "ies"} ·{" "}
                          {subGroups.length} supplier
                          {subGroups.length === 1 ? "" : "s"}
                        </span>
                      </summary>
                      <div className="space-y-1.5 border-t bg-white px-2 py-2">
                        {subGroups.map((group) => {
                          const first = group[0];
                          const plotLabels = group.map((d) =>
                            d.job.plot.plotNumber
                              ? `P${d.job.plot.plotNumber}`
                              : d.job.plot.name,
                          );
                          const allIds = group.map((d) => d.id);
                          const anyPending = allIds.some((id) =>
                            isOrderPending(id),
                          );
                          return (
                            <div
                              key={`${first.supplier.id}__${first.job.name}`}
                              className="rounded border p-2 text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/suppliers/${first.supplier.id}`}
                                  className="font-medium text-blue-600 hover:underline"
                                >
                                  {first.supplier.name}
                                </Link>
                                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                  Ordered
                                </span>
                                {first.expectedDeliveryDate && (
                                  <span className="ml-auto text-xs font-medium">
                                    {format(
                                      new Date(first.expectedDeliveryDate),
                                      "d MMM",
                                    )}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {first.itemsDescription || first.job.name}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {first.job.name} · {plotLabels.join(", ")}
                                {group.length > 1
                                  ? ` (${group.length} plots)`
                                  : ""}
                              </p>
                              <JobActionStrip>
                                <input
                                  type="date"
                                  className="h-6 w-[110px] rounded border px-1 text-[10px]"
                                  defaultValue={
                                    first.expectedDeliveryDate
                                      ? format(
                                          new Date(first.expectedDeliveryDate),
                                          "yyyy-MM-dd",
                                        )
                                      : ""
                                  }
                                  onChange={async (e) => {
                                    if (!e.target.value) return;
                                    // (May 2026 pattern sweep) Pre-fix
                                    // this loop fired N PUTs and
                                    // refreshed regardless. Any silent
                                    // failure (403, 500) left the UI
                                    // claiming the date update worked
                                    // when it didn't. Now: count
                                    // failures, toast if any.
                                    const failures: string[] = [];
                                    for (const id of allIds) {
                                      try {
                                        const res = await fetch(`/api/orders/${id}`, {
                                          method: "PUT",
                                          headers: {
                                            "Content-Type": "application/json",
                                          },
                                          body: JSON.stringify({
                                            expectedDeliveryDate: e.target.value,
                                          }),
                                        });
                                        if (!res.ok) {
                                          failures.push(
                                            await fetchErrorMessage(res, `Order ${id} failed`),
                                          );
                                        }
                                      } catch (err) {
                                        failures.push(
                                          err instanceof Error
                                            ? err.message
                                            : `Order ${id} — network error`,
                                        );
                                      }
                                    }
                                    if (failures.length > 0) {
                                      toast.error(
                                        `${failures.length} of ${allIds.length} delivery date${
                                          allIds.length === 1 ? "" : "s"
                                        } failed to update.`,
                                      );
                                    }
                                    onRefresh();
                                  }}
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-9 gap-1 text-xs"
                                  disabled={anyPending}
                                  onClick={() =>
                                    allIds.forEach((id) =>
                                      onOrderAction(id, "DELIVERED"),
                                    )
                                  }
                                >
                                  {anyPending ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="size-3" />
                                  )}
                                  <span className="ml-1">Mark Received</span>
                                </Button>
                              </JobActionStrip>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                });
              })()}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
