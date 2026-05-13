/**
 * Inline Start / Complete / Extend button strip rendered in every
 * job row across the Daily Brief.
 *
 * (May 2026 sprint 7a) Extracted from DailySiteBrief.tsx (UX #1).
 * Behaviour reference:
 *   - status=COMPLETED        → green "Done" pill (read-only)
 *   - pending=true            → spinner (single-flight against
 *                               useJobAction)
 *   - status=NOT_STARTED      → "Extend" (optional) + "Start"
 *   - status=IN_PROGRESS      → "Extend" (optional) + "Complete"
 *   - any other status        → null (cascade / on-hold rows render
 *                               their own row-level affordances)
 *
 * `onExtend` is optional because some surfaces don't expose extend
 * (the Awaiting Sign Off section, for instance, treats jobs as
 * effectively complete already).
 */

import { Check, CheckCircle2, Clock, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface JobActionButtonProps {
  jobId: string;
  status: string;
  pending: boolean;
  onAction: (jobId: string, action: "start" | "complete") => void;
  onExtend?: (jobId: string) => void;
}

export function JobActionButton({
  jobId,
  status,
  pending,
  onAction,
  onExtend,
}: JobActionButtonProps) {
  if (status === "COMPLETED") {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-green-600">
        <Check className="size-3" /> Done
      </span>
    );
  }

  if (pending) {
    return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
  }

  if (status === "NOT_STARTED") {
    return (
      <div className="flex items-center gap-1">
        {onExtend && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1 border-orange-200 px-2 text-xs text-orange-700 hover:bg-orange-50"
            onClick={(e) => {
              e.stopPropagation();
              onExtend(jobId);
            }}
          >
            <Clock className="size-2.5" /> Extend
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1 border-green-200 px-2 text-xs text-green-700 hover:bg-green-50"
          onClick={(e) => {
            e.stopPropagation();
            onAction(jobId, "start");
          }}
        >
          <Play className="size-2.5" /> Start
        </Button>
      </div>
    );
  }

  if (status === "IN_PROGRESS") {
    return (
      <div className="flex items-center gap-1">
        {onExtend && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1 border-orange-200 px-2 text-xs text-orange-700 hover:bg-orange-50"
            onClick={(e) => {
              e.stopPropagation();
              onExtend(jobId);
            }}
          >
            <Clock className="size-2.5" /> Extend
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1 border-blue-200 px-2 text-xs text-blue-700 hover:bg-blue-50"
          onClick={(e) => {
            e.stopPropagation();
            onAction(jobId, "complete");
          }}
        >
          <CheckCircle2 className="size-2.5" /> Complete
        </Button>
      </div>
    );
  }

  return null;
}
