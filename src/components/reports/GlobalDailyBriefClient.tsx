"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Building2 } from "lucide-react";
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

  const handleSiteChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("site", value);
    } else {
      params.delete("site");
    }
    router.replace(`/daily-brief?${params.toString()}`);
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-5 text-blue-600" />
          <h1 className="text-xl font-semibold">
            {selectedSite ? `Daily Brief — ${selectedSite.name}` : "Tasks & Daily Brief"}
          </h1>
        </div>

        {/* Site picker */}
        <Select value={selectedSiteId} onValueChange={(v) => handleSiteChange(v ?? "")}>
          <SelectTrigger className="h-9 w-auto min-w-[200px] text-sm">
            <Building2 className="mr-2 size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left">
              {selectedSite
                ? selectedSite.name
                : <span className="text-muted-foreground">Select a site…</span>}
            </span>
          </SelectTrigger>
          <SelectContent>
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
