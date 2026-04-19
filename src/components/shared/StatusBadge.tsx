"use client";

/**
 * Single source of truth for all status badge rendering in the app.
 *
 * Before: JobDetailClient, PlotDetailClient, ContractorDetailSheet each
 * kept their own identical STATUS_CONFIG map + StatusBadge component.
 * SiteWalkthrough's order/snag badge configs were separate again. Sizing
 * drifted (text-xs vs text-sm) and minor colour tweaks creep in over time.
 *
 * Now: import `JobStatusBadge`, `OrderStatusBadge`, `SnagStatusBadge`. All
 * consumers render the same dot+label style so a job that's IN_PROGRESS
 * looks identical everywhere. The config maps are exported too for rare
 * callers that need the raw colour (e.g. bordering a card by status).
 *
 * Sizing: default "sm" (px-2.5 py-0.5 text-xs) for list rows, "md"
 * (px-3 py-1 text-sm) for detail-page headers.
 */

import { CircleDot, AlertTriangle, CircleDashed, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type BadgeSize = "sm" | "md";

// ─── Job lifecycle statuses ──────────────────────────────────────────────

export const JOB_STATUS_CONFIG: Record<
  string,
  { label: string; bgColor: string; dotColor: string }
> = {
  NOT_STARTED: {
    label: "Not Started",
    bgColor: "bg-slate-400/10",
    dotColor: "text-slate-400",
  },
  IN_PROGRESS: {
    label: "In Progress",
    bgColor: "bg-amber-500/10",
    dotColor: "text-amber-500",
  },
  ON_HOLD: {
    label: "On Hold",
    bgColor: "bg-red-500/10",
    dotColor: "text-red-500",
  },
  COMPLETED: {
    label: "Completed",
    bgColor: "bg-green-500/10",
    dotColor: "text-green-500",
  },
};

export function JobStatusBadge({ status, size = "sm" }: { status: string; size?: BadgeSize }) {
  const config = JOB_STATUS_CONFIG[status] ?? JOB_STATUS_CONFIG.NOT_STARTED;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        config.bgColor,
        size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"
      )}
    >
      <CircleDot className={cn("size-3", config.dotColor)} />
      <span>{config.label}</span>
    </div>
  );
}

// ─── Order statuses ──────────────────────────────────────────────────────

export const ORDER_STATUS_CONFIG: Record<
  string,
  { label: string; bgColor: string; textColor: string }
> = {
  PENDING: {
    label: "Pending",
    bgColor: "bg-slate-100",
    textColor: "text-slate-600",
  },
  ORDERED: {
    label: "Ordered",
    bgColor: "bg-blue-100",
    textColor: "text-blue-700",
  },
  DELIVERED: {
    label: "Delivered",
    bgColor: "bg-green-100",
    textColor: "text-green-700",
  },
  CANCELLED: {
    label: "Cancelled",
    bgColor: "bg-red-100",
    textColor: "text-red-700",
  },
};

export function OrderStatusBadge({ status, size = "sm" }: { status: string; size?: BadgeSize }) {
  const config = ORDER_STATUS_CONFIG[status] ?? ORDER_STATUS_CONFIG.PENDING;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        config.bgColor,
        config.textColor,
        size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"
      )}
    >
      {config.label}
    </span>
  );
}

// ─── Snag statuses ───────────────────────────────────────────────────────

export const SNAG_STATUS_CONFIG: Record<
  string,
  { label: string; bgColor: string; textColor: string; icon: typeof CircleDashed }
> = {
  OPEN: {
    label: "Open",
    bgColor: "bg-red-50",
    textColor: "text-red-700",
    icon: AlertTriangle,
  },
  IN_PROGRESS: {
    label: "In Progress",
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    icon: CircleDashed,
  },
  RESOLVED: {
    label: "Resolved",
    bgColor: "bg-green-50",
    textColor: "text-green-700",
    icon: CircleCheck,
  },
  CLOSED: {
    label: "Closed",
    bgColor: "bg-slate-100",
    textColor: "text-slate-600",
    icon: CircleCheck,
  },
};

export function SnagStatusBadge({ status, size = "sm" }: { status: string; size?: BadgeSize }) {
  const config = SNAG_STATUS_CONFIG[status] ?? SNAG_STATUS_CONFIG.OPEN;
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        config.bgColor,
        config.textColor,
        size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"
      )}
    >
      <Icon className="size-3" />
      {config.label}
    </span>
  );
}

// ─── Snag priorities (separate concept, but co-located for consistency) ──

export const SNAG_PRIORITY_CONFIG: Record<
  string,
  { label: string; bgColor: string; textColor: string }
> = {
  LOW: { label: "Low", bgColor: "bg-slate-100", textColor: "text-slate-600" },
  MEDIUM: { label: "Medium", bgColor: "bg-blue-100", textColor: "text-blue-700" },
  HIGH: { label: "High", bgColor: "bg-amber-100", textColor: "text-amber-800" },
  CRITICAL: { label: "Critical", bgColor: "bg-red-100", textColor: "text-red-700" },
};

export function SnagPriorityBadge({ priority, size = "sm" }: { priority: string; size?: BadgeSize }) {
  const config = SNAG_PRIORITY_CONFIG[priority] ?? SNAG_PRIORITY_CONFIG.MEDIUM;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        config.bgColor,
        config.textColor,
        size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"
      )}
    >
      {config.label}
    </span>
  );
}
