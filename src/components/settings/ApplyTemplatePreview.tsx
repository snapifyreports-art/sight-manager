"use client";

import { Calendar, Truck, Briefcase, PoundSterling, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { previewTemplateApply, formatGBP } from "@/lib/template-preview";
import type { TemplateData } from "./types";

/**
 * Apply-template dry-run modal. Shows a per-plot summary of:
 *   - Total span (working days + calendar end date)
 *   - Stages / sub-jobs counts
 *   - Order schedule (place + arrive dates)
 *   - Total order-item cost
 *   - Delivery collision warnings
 *
 * No DB writes, no fetches — pure client computation. Open this BEFORE
 * the apply commits so 26-plot mistakes get caught at the cheap stage.
 */
export function ApplyTemplatePreview({
  open,
  onClose,
  template,
  startDate,
  onConfirm,
  applying,
}: {
  open: boolean;
  onClose: () => void;
  template: TemplateData;
  startDate: Date;
  onConfirm: () => void;
  applying?: boolean;
}) {
  const preview = previewTemplateApply(template, startDate);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apply preview — {template.name}</DialogTitle>
          <DialogDescription>
            Dry-run of what will happen per plot when this template is applied.
            No changes made yet.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto py-2">
          {/* Headline numbers */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat
              icon={<Calendar className="size-3.5 text-blue-600" />}
              label="Span"
              value={`${preview.totalWeeks} wk`}
              hint={`${preview.totalWorkingDays} working days`}
            />
            <Stat
              icon={<Briefcase className="size-3.5 text-blue-600" />}
              label="Jobs"
              value={`${preview.stageCount} + ${preview.subJobCount}`}
              hint="stages + sub-jobs"
            />
            <Stat
              icon={<Truck className="size-3.5 text-emerald-600" />}
              label="Orders"
              value={preview.orders.length.toString()}
              hint={`${preview.collisionWeeks.length} busy week${preview.collisionWeeks.length === 1 ? "" : "s"}`}
            />
            <Stat
              icon={<PoundSterling className="size-3.5 text-amber-600" />}
              label="Order cost"
              value={formatGBP(preview.ordersTotalCost)}
              hint="per plot"
            />
          </div>

          {/* Date window */}
          <div className="rounded-lg border bg-slate-50 p-3 text-xs">
            <p className="font-medium">
              <span className="text-muted-foreground">Start:</span>{" "}
              {formatDate(preview.startDate)}{" "}
              <span className="px-1 text-muted-foreground">→</span>{" "}
              <span className="text-muted-foreground">Finish:</span>{" "}
              {formatDate(preview.endDate)}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Working days only (Mon–Fri). Weekends skipped.
            </p>
          </div>

          {/* Collision warning */}
          {preview.collisionWeeks.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">Delivery pile-ups detected</p>
                <ul className="mt-1 list-inside list-disc">
                  {preview.collisionWeeks.map((c) => (
                    <li key={c.week}>
                      Week {c.week}: {c.orderCount} orders arriving — supplier
                      may struggle.
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Order schedule table */}
          {preview.orders.length > 0 && (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 text-left">Items</th>
                    <th className="px-3 py-1.5 text-left">For job</th>
                    <th className="px-3 py-1.5 text-left">Place by</th>
                    <th className="px-3 py-1.5 text-left">Arrive</th>
                    <th className="px-3 py-1.5 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.orders.map((o) => (
                    <tr key={o.id}>
                      <td className="px-3 py-1.5 font-medium">
                        {o.itemsDescription}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {o.jobName}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {formatDate(o.orderDate)}{" "}
                        <span className="text-muted-foreground">
                          (w{o.orderWeek})
                        </span>
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {formatDate(o.deliveryDate)}{" "}
                        <span className="text-muted-foreground">
                          (w{o.deliveryWeek})
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {o.totalCost > 0 ? formatGBP(o.totalCost) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={onConfirm} disabled={applying}>
            {applying ? "Applying..." : "Apply template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-2 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-0.5 text-base font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(date);
}
