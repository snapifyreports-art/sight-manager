/**
 * Recent activity event log card on the Daily Brief.
 *
 * (May 2026 sprint 7a) Extracted from DailySiteBrief.tsx. Collapsed
 * by default — the user opens it when they want to scan the day's
 * recent actions. The list is rendered chronologically (newest first)
 * — that ordering is set server-side in the daily-brief route.
 */

import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Activity, ChevronDown } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BriefData } from "./types";

export interface RecentActivitySectionProps {
  data: BriefData;
  openSections: Set<string>;
  toggleSection: (key: string) => void;
}

export function RecentActivitySection({
  data,
  openSections,
  toggleSection,
}: RecentActivitySectionProps) {
  if (data.recentEvents.length === 0) return null;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none pb-2"
        onClick={() => toggleSection("recent-activity")}
      >
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="size-4 text-slate-600" />
          Recent Activity ({data.recentEvents.length})
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 shrink-0 transition-transform duration-200",
              openSections.has("recent-activity") && "rotate-180",
            )}
          />
        </CardTitle>
      </CardHeader>
      {openSections.has("recent-activity") && (
        <CardContent>
          <div className="space-y-1.5">
            {data.recentEvents.map((e) => (
              <div key={e.id} className="flex items-start gap-2 text-sm">
                <span className="shrink-0 text-xs text-muted-foreground">
                  {format(new Date(e.createdAt), "HH:mm")}
                </span>
                <span className="flex-1 text-muted-foreground">
                  {e.description}
                </span>
                {e.user && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {e.user.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
