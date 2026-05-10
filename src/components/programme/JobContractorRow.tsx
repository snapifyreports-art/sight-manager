"use client";

import { HardHat, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * (May 2026 JobWeekPanel split) Contractor row extracted from
 * JobWeekPanel. Renders the "Assigned contractors" strip with an
 * inline Change / Assign button.
 */

export interface PanelContractor {
  id: string;
  name: string;
  company: string | null;
}

interface Props {
  contractors: PanelContractor[];
  isSynthetic: boolean;
  onEdit: () => void;
}

export function JobContractorRow({ contractors, isSynthetic, onEdit }: Props) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <HardHat className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {contractors.length === 0 ? (
          <span className="text-sm text-muted-foreground">No contractor assigned</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {contractors.map((c) => (
              <span
                key={c.id}
                className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700"
              >
                {c.company || c.name}
              </span>
            ))}
          </div>
        )}
      </div>
      {!isSynthetic && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1 text-xs"
          onClick={onEdit}
        >
          <Pencil className="size-3" aria-hidden />
          {contractors.length === 0 ? "Assign" : "Change"}
        </Button>
      )}
    </div>
  );
}
