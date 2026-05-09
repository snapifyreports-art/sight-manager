"use client";

import { CalendarRange } from "lucide-react";
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
import { BatchProgrammePreview } from "./BatchProgrammePreview";
import type { TemplateJobData } from "@/components/settings/types";

interface BatchPlot {
  plotNumber: string;
  startDate: string;
}

interface Batch {
  id: string;
  mode: "blank" | "template";
  templateId: string;
  variantId: string;
  templateName: string;
  variantName?: string;
  plots: BatchPlot[];
}

interface TemplateLike {
  id: string;
  name: string;
  jobs: TemplateJobData[];
}

/**
 * Full-size programme preview dialog. Wraps BatchProgrammePreview in
 * a wide modal so the per-plot stage breakdown + delivery markers
 * have room to breathe — the inline version inside the wizard form
 * was cramped and ended up confusing rather than helpful.
 *
 * Triggered by a "Preview programme" button next to the Add Plot
 * Group button. Opens to ~6xl wide and lets the existing component
 * render at proper Gantt scale.
 */
export function BatchProgrammePreviewDialog({
  open,
  onClose,
  batches,
  templates,
}: {
  open: boolean;
  onClose: () => void;
  batches: Batch[];
  templates: TemplateLike[];
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            <CalendarRange className="-mt-0.5 mr-2 inline size-4 text-blue-600" />
            Programme preview
          </DialogTitle>
          <DialogDescription>
            What the site programme will look like once these plots are
            created. Stages match the variant's actual durations; truck
            markers show every order's expected arrival date.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto py-2">
          <BatchProgrammePreview batches={batches} templates={templates} />
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
