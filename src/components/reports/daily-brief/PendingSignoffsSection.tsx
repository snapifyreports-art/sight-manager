/**
 * Pending Sign-offs card on the Daily Brief.
 *
 * (May 2026 sprint 7a) Extracted from DailySiteBrief.tsx.
 *
 * Lists jobs that have moved into IN_PROGRESS on a later stage while
 * an earlier-stage job is still un-signed-off. The site manager is
 * the bottleneck — these rows nudge them to clear the queue. Each
 * row links to /jobs/[id] where the sign-off button lives.
 */

import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronDown } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BriefData } from "./types";

export interface PendingSignoffsSectionProps {
  data: BriefData;
  openSections: Set<string>;
  toggleSection: (key: string) => void;
}

export function PendingSignoffsSection({
  data,
  openSections,
  toggleSection,
}: PendingSignoffsSectionProps) {
  if (!data.pendingSignOffs || data.pendingSignOffs.length === 0) return null;

  return (
    <Card id="section-pending-signoffs" className="border-amber-200">
      <CardHeader
        className="cursor-pointer select-none pb-2"
        onClick={() => toggleSection("pending-signoffs")}
      >
        <CardTitle className="flex items-center gap-2 text-sm text-amber-800">
          <AlertTriangle className="size-4 text-amber-500" />
          Pending Sign-offs ({data.pendingSignOffs.length})
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 shrink-0 transition-transform duration-200",
              openSections.has("pending-signoffs") && "rotate-180",
            )}
          />
        </CardTitle>
        <CardDescription className="text-xs">
          Jobs still open while subsequent work has started
        </CardDescription>
      </CardHeader>
      {openSections.has("pending-signoffs") && (
        <CardContent>
          <div className="space-y-2">
            {data.pendingSignOffs.map((j) => (
              <a
                key={j.id}
                href={`/jobs/${j.id}`}
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 transition-colors hover:bg-amber-100"
              >
                <div>
                  <p className="text-sm font-medium text-amber-900">{j.name}</p>
                  <p className="text-xs text-amber-600">
                    {j.plot.plotNumber
                      ? `Plot ${j.plot.plotNumber}`
                      : j.plot.name}
                  </p>
                </div>
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                  Sign Off
                </span>
              </a>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
