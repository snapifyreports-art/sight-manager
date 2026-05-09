"use client";

import { useMemo } from "react";
import { PoundSterling } from "lucide-react";
import type { TemplateData } from "./types";

/**
 * Per-template cost summary footer for the editor.
 *
 * Sums every TemplateOrderItem (qty × unitCost) on every order on every
 * job (parents + children + grandchildren). Pure client-side, no
 * network round-trip — TemplateData already carries items.
 *
 * Materials live in a separate API and are summed in TemplateExtras
 * directly (it owns that data already). The two footers together give
 * the user a per-plot cost picture without forcing either component
 * to fetch the other's data.
 */
export function TemplateCostFooter({ template }: { template: TemplateData }) {
  const { orderItemsTotal, orderCount, itemCount } = useMemo(() => {
    let total = 0;
    let orders = 0;
    let items = 0;
    function walkJobs(jobs: TemplateData["jobs"][number][]) {
      for (const job of jobs) {
        for (const order of job.orders ?? []) {
          orders += 1;
          for (const item of order.items ?? []) {
            items += 1;
            total += (item.quantity || 0) * (item.unitCost || 0);
          }
        }
        if (job.children?.length) walkJobs(job.children);
      }
    }
    walkJobs(template.jobs);
    return { orderItemsTotal: total, orderCount: orders, itemCount: items };
  }, [template]);

  if (orderCount === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
        <PoundSterling className="size-3.5" />
        <span>
          No orders yet — once you add orders with items, the per-plot
          order cost will sum here.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border/60 bg-slate-50 px-3 py-2 text-xs">
      <span className="flex items-center gap-1 font-medium text-foreground">
        <PoundSterling className="size-3.5" />
        Order items: {formatGBP(orderItemsTotal)}
      </span>
      <span className="text-muted-foreground">
        {itemCount} item{itemCount === 1 ? "" : "s"} across {orderCount} order
        {orderCount === 1 ? "" : "s"}
      </span>
      {itemCount === 0 && orderCount > 0 && (
        <span className="text-amber-700">
          orders have no line items — totals will be £0 until items added
        </span>
      )}
      <span className="ml-auto text-[11px] text-muted-foreground">
        Materials cost shown below (Materials &amp; Drawings)
      </span>
    </div>
  );
}

function formatGBP(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
