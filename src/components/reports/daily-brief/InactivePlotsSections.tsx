/**
 * Inactive plots cards on the Daily Brief — TWO related cards:
 *
 *   1. Awaiting Contractor Confirmation: plots whose next job is
 *      blocked on a contractor saying yes.
 *   2. Inactive Plots (general): all plots with no active work
 *      including not-started, deferred, awaiting-materials, etc.
 *
 * (May 2026 sprint 7a) Both extracted together since they share
 * the inactivePlots feed, the same triggerJobAction handler, and a
 * common section-header banner above them.
 *
 * Behaviour: clicking "Confirmed — Start Job" or "Start <jobName>"
 * fires the parent's triggerJobAction with `start` — the parent
 * owns the pre-start dialog flow and dependency-check ladder.
 */

import { cn } from "@/lib/utils";
import {
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  HardHat,
  Mail,
  PauseCircle,
  Phone,
  PlayCircle,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BriefData, InactivePlot } from "./types";

export type JobActionTarget = {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
};

export interface InactivePlotsSectionsProps {
  data: BriefData;
  openSections: Set<string>;
  toggleSection: (key: string) => void;
  /** Fire the parent's pre-start dialog flow for the given job. */
  onTriggerStart: (job: JobActionTarget) => void;
}

/**
 * Header banner above the inactive cluster — purely decorative,
 * matches the "Pipeline" banner style used elsewhere.
 */
function InactivePlotsBanner({ count }: { count: number }) {
  return (
    <div className="mt-6 flex items-center gap-2 border-b-2 border-amber-200 pb-1">
      <PauseCircle className="size-4 text-amber-600" />
      <h2 className="text-xs font-bold uppercase tracking-widest text-amber-900">
        Inactive Plots
      </h2>
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        {count} plots need decisions
      </span>
    </div>
  );
}

function AwaitingContractor({
  plots,
  openSections,
  toggleSection,
  onTriggerStart,
}: {
  plots: InactivePlot[];
  openSections: Set<string>;
  toggleSection: (key: string) => void;
  onTriggerStart: InactivePlotsSectionsProps["onTriggerStart"];
}) {
  if (plots.length === 0) return null;

  return (
    <Card
      id="section-contractor-confirmations"
      className="border-orange-200 bg-orange-50/40"
    >
      <CardHeader
        className="cursor-pointer select-none pb-2"
        onClick={() => toggleSection("contractor-confirmations")}
      >
        <CardTitle className="flex items-center gap-2 text-sm text-orange-700">
          <HardHat className="size-4" />
          Awaiting Contractor Confirmation ({plots.length})
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 shrink-0 transition-transform duration-200",
              openSections.has("contractor-confirmations") && "rotate-180",
            )}
          />
        </CardTitle>
        <p className="text-xs text-orange-600">
          Contractor needs to confirm availability before work can begin
        </p>
      </CardHeader>
      {openSections.has("contractor-confirmations") && (
        <CardContent className="space-y-2 pt-0">
          {plots.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-orange-200 bg-white p-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {p.plotNumber ? `Plot ${p.plotNumber}` : p.name}
                    {p.houseType && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        ({p.houseType})
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-orange-700">
                    {p.nextJob?.name || "Next job"}
                  </p>
                  {p.nextJob?.contractorName && (
                    <p className="mt-1 text-xs font-medium">
                      {p.nextJob.contractorName}
                    </p>
                  )}
                </div>
                <span className="rounded bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                  Awaiting
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.nextJob?.contractorPhone && (
                  <a
                    href={`tel:${p.nextJob.contractorPhone}`}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <Phone className="size-3" /> Call
                  </a>
                )}
                {p.nextJob?.contractorEmail && (
                  <a
                    href={`mailto:${p.nextJob.contractorEmail}`}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <Mail className="size-3" /> Email
                  </a>
                )}
                {p.nextJob && (
                  <button
                    onClick={() =>
                      onTriggerStart({
                        id: p.nextJob!.id,
                        name: p.nextJob!.name,
                        status: "NOT_STARTED",
                        startDate: p.nextJob!.startDate ?? null,
                        endDate: p.nextJob!.endDate ?? null,
                      })
                    }
                    className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700"
                  >
                    <CheckCircle className="size-3" /> Confirmed — Start Job
                  </button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function InactivePlotsList({
  plots,
  openSections,
  toggleSection,
  onTriggerStart,
}: {
  plots: InactivePlot[];
  openSections: Set<string>;
  toggleSection: (key: string) => void;
  onTriggerStart: InactivePlotsSectionsProps["onTriggerStart"];
}) {
  if (plots.length === 0) return null;

  return (
    <Card
      id="section-inactive-plots"
      className="border-amber-200 bg-amber-50/40"
    >
      <CardHeader
        className="cursor-pointer select-none pb-2"
        onClick={() => toggleSection("inactive-plots")}
      >
        <CardTitle className="flex items-center gap-2 text-sm text-amber-700">
          <PauseCircle className="size-4" />
          Inactive Plots ({plots.length})
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 shrink-0 transition-transform duration-200",
              openSections.has("inactive-plots") && "rotate-180",
            )}
          />
        </CardTitle>
        <CardDescription className="text-xs text-amber-600/80">
          Plots with no active jobs — need attention
        </CardDescription>
      </CardHeader>
      {openSections.has("inactive-plots") && (
        <CardContent className="space-y-2">
          {plots.map((p) => {
            const hasContractor =
              p.hasContractor ?? !!p.nextJob?.contractorName;
            const ordersPending = p.ordersPending ?? 0;
            const ordersOrdered = p.ordersOrdered ?? 0;
            const ordersTotal = p.ordersTotal ?? 0;
            const allDelivered =
              ordersTotal === 0 || (ordersPending === 0 && ordersOrdered === 0);
            const allSent = ordersPending === 0;
            return (
              <div
                key={p.id}
                className="rounded-xl border border-amber-200 bg-white p-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {p.plotNumber ? `Plot ${p.plotNumber}` : p.name}
                      {p.houseType && (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          ({p.houseType})
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-amber-700">{p.label}</p>
                  </div>
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-semibold",
                      p.inactivityType === "not_started"
                        ? "bg-slate-100 text-slate-600"
                        : p.inactivityType === "deferred"
                          ? "bg-amber-100 text-amber-700"
                          : p.inactivityType === "awaiting_contractor"
                            ? "bg-orange-100 text-orange-700"
                            : p.inactivityType === "awaiting_materials"
                              ? "bg-red-100 text-red-700"
                              : "bg-blue-100 text-blue-700",
                    )}
                  >
                    {p.inactivityType === "not_started"
                      ? "Not Started"
                      : p.inactivityType === "deferred"
                        ? "Deferred"
                        : p.inactivityType === "awaiting_contractor"
                          ? "Contractor"
                          : p.inactivityType === "awaiting_materials"
                            ? "Materials"
                            : "Waiting"}
                  </span>
                </div>
                {/* Checklist */}
                {p.nextJob && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span
                      className={hasContractor ? "text-green-700" : "text-red-600"}
                    >
                      {hasContractor ? (
                        <Check className="mr-0.5 inline size-3" />
                      ) : (
                        <X className="mr-0.5 inline size-3" />
                      )}
                      Contractor {hasContractor ? "assigned" : "not assigned"}
                    </span>
                    <span className={allSent ? "text-green-700" : "text-red-600"}>
                      {allSent ? (
                        <Check className="mr-0.5 inline size-3" />
                      ) : (
                        <X className="mr-0.5 inline size-3" />
                      )}
                      {ordersPending > 0
                        ? `${ordersPending} order${ordersPending !== 1 ? "s" : ""} not sent`
                        : "Orders sent"}
                    </span>
                    <span
                      className={
                        allDelivered ? "text-green-700" : "text-amber-600"
                      }
                    >
                      {allDelivered ? (
                        <Check className="mr-0.5 inline size-3" />
                      ) : (
                        <Clock className="mr-0.5 inline size-3" />
                      )}
                      {allDelivered
                        ? "Materials on site"
                        : `${ordersOrdered} awaiting delivery`}
                    </span>
                  </div>
                )}
                {p.nextJob && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        onTriggerStart({
                          id: p.nextJob!.id,
                          name: p.nextJob!.name,
                          status: "NOT_STARTED",
                          startDate: p.nextJob!.startDate ?? null,
                          endDate: p.nextJob!.endDate ?? null,
                        })
                      }
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                    >
                      <PlayCircle className="size-3" /> Start {p.nextJob.name}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Composite: renders the banner + both inactive cards in order.
 * Returns nothing when there are zero inactive plots.
 */
export function InactivePlotsSections({
  data,
  openSections,
  toggleSection,
  onTriggerStart,
}: InactivePlotsSectionsProps) {
  const inactive = data.inactivePlots ?? [];
  if (inactive.length === 0) return null;
  const awaitingContractor = inactive.filter(
    (p) => p.inactivityType === "awaiting_contractor",
  );

  return (
    <>
      <InactivePlotsBanner count={inactive.length} />
      <AwaitingContractor
        plots={awaitingContractor}
        openSections={openSections}
        toggleSection={toggleSection}
        onTriggerStart={onTriggerStart}
      />
      <InactivePlotsList
        plots={inactive}
        openSections={openSections}
        toggleSection={toggleSection}
        onTriggerStart={onTriggerStart}
      />
    </>
  );
}
