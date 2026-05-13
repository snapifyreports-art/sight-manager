"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DailySiteBrief } from "@/components/reports/DailySiteBrief";
import { TasksClient } from "@/components/tasks/TasksClient";

interface SiteOption {
  id: string;
  name: string;
  postcode: string | null;
  status: string;
}

interface GlobalDailyBriefClientProps {
  sites: SiteOption[];
}

export function GlobalDailyBriefClient({ sites }: GlobalDailyBriefClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const selectedSiteId = searchParams.get("site") ?? "";
  const selectedSite = sites.find((s) => s.id === selectedSiteId);

  // (May 2026 audit SM-P1) When the user picks a specific site, route
  // to the CANONICAL per-site URL (/sites/[id]?tab=daily-brief) instead
  // of /daily-brief?site=. Pre-fix two URL shapes returned the same
  // view, creating stale-bookmark + back-button confusion when a link
  // was shared. The All-Sites option still lives at /daily-brief.
  const handleSiteChange = (value: string) => {
    if (value) {
      router.replace(`/sites/${value}?tab=daily-brief`);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("site");
    router.replace(`/daily-brief?${params.toString()}`);
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header — note: the child components render their own <h1> + context.
          This wrapper just provides the site picker at the top. */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* Site picker */}
        <Select value={selectedSiteId || "all"} onValueChange={(v) => handleSiteChange(v === "all" ? "" : (v ?? ""))}>
          <SelectTrigger className="h-9 w-auto min-w-[200px] text-sm">
            <Building2 className="mr-2 size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left">
              {selectedSite ? selectedSite.name : "All Sites"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sites</SelectItem>
            {sites.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
                {s.status === "ON_HOLD" && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">(on hold)</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {selectedSite ? (
        <DailySiteBrief siteId={selectedSite.id} />
      ) : (
        <TasksClient />
      )}
    </div>
  );
}
