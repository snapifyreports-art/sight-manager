"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { AlertCircle, Plus, Building2, MapPin, FolderOpen, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { CreateSiteWizard } from "./CreateSiteWizard";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { useBusyOverlay } from "@/components/ui/busy-overlay";
import { useConfirmAction } from "@/hooks/useConfirmAction";

// ---------- Types ----------

interface JobStatusSummary {
  NOT_STARTED: number;
  IN_PROGRESS: number;
  ON_HOLD: number;
  COMPLETED: number;
}

interface SiteItem {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  address: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; email: string };
  _count: { plots: number };
  jobStatusSummary: JobStatusSummary;
}

// ---------- Helpers ----------

const SITE_STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  ACTIVE: {
    label: "Active",
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  },
  ON_HOLD: {
    label: "On Hold",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-green-500/10 text-green-700 dark:text-green-400",
  },
  ARCHIVED: {
    label: "Archived",
    className: "bg-gray-500/10 text-gray-700 dark:text-gray-400",
  },
};

const JOB_STATUS_DOT: Record<string, string> = {
  NOT_STARTED: "bg-slate-400",
  IN_PROGRESS: "bg-blue-500",
  ON_HOLD: "bg-amber-500",
  COMPLETED: "bg-green-500",
};

function getSiteStatusConfig(status: string) {
  return SITE_STATUS_CONFIG[status] ?? SITE_STATUS_CONFIG.ACTIVE;
}

// ---------- Main Component ----------

export function SitesClient({
  sites: initialSites,
}: {
  sites: SiteItem[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { withLock } = useBusyOverlay();
  const searchParams = useSearchParams();
  const [sites, setSites] = useState(initialSites);
  const [dialogOpen, setDialogOpen] = useState(false);

  // (May 2026 pattern sweep) Sync to prop changes after router.refresh().
  useEffect(() => {
    setSites(initialSites);
  }, [initialSites]);

  // (May 2026 audit SM-P0-1 / FC-P0) Auto-open the create-site wizard
  // when arriving via `?action=new` — used by Cmd-K's "Create site"
  // verb and the FAB. Pre-fix the link landed on /sites but never
  // opened the wizard.
  const actionParam = searchParams.get("action");
  useEffect(() => {
    if (actionParam === "new") setDialogOpen(true);
  }, [actionParam]);

  // When the sidebar sent the user here without a site picked (e.g. they
  // clicked "Programme" with no site selected), `?pickFor=<tab>` tells us
  // which tab to forward them to after they pick. Pretty-label for the
  // banner so they know why they're on this page.
  const pickFor = searchParams.get("pickFor");
  const pickForLabel = pickFor
    ? pickFor
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : null;

  const goToSite = (siteId: string) => {
    if (pickFor === "walkthrough") {
      router.push(`/sites/${siteId}/walkthrough`);
    } else if (pickFor) {
      router.push(`/sites/${siteId}?tab=${pickFor}`);
    } else {
      router.push(`/sites/${siteId}`);
    }
  };

  // Confirm-delete shared via useConfirmAction
  const { confirmAction, dialogs: confirmDialogs } = useConfirmAction();

  function handleSiteCreated(created: Omit<SiteItem, "jobStatusSummary">) {
    setSites((prev) => [
      {
        ...created,
        jobStatusSummary: {
          NOT_STARTED: 0,
          IN_PROGRESS: 0,
          ON_HOLD: 0,
          COMPLETED: 0,
        },
      },
      ...prev,
    ]);
    router.refresh();
  }

  function handleOpenDelete(site: SiteItem) {
    confirmAction({
      title: "Delete Site",
      description: (
        <>
          Are you sure you want to delete{" "}
          <span className="font-semibold text-foreground">{site.name}</span>?
          This will permanently remove the site and all its plots, jobs,
          photos, and notes. This action cannot be undone.
        </>
      ),
      confirmLabel: "Delete Site",
      onConfirm: async () => {
        // (May 2026 Keith bug report) Site delete cascades through
        // plots/jobs/orders/snags/documents — lock the screen so the
        // user can't double-click and trigger a parallel delete, or
        // navigate away mid-cascade.
        await withLock(`Deleting ${site.name}…`, async () => {
          const res = await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
          if (!res.ok) {
            throw new Error(await fetchErrorMessage(res, "Failed to delete site"));
          }
          setSites((prev) => prev.filter((s) => s.id !== site.id));
          toast.success(`${site.name} deleted`);
          router.refresh();
        });
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* Pick-a-site banner — shown when the user arrived here via a sidebar
          link that needs a site context (e.g. clicked "Programme" with no
          site selected). Explains why they're here rather than on the tab
          they expected. */}
      {pickForLabel && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-blue-600" />
          <div>
            <p className="font-medium">Pick a site to view its {pickForLabel}</p>
            <p className="text-xs text-blue-800/80">
              Click any site below and you&apos;ll land on {pickForLabel} for that site.
            </p>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sites</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your construction sites and plots
          </p>
        </div>

        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          New Site
        </Button>
        <CreateSiteWizard
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={handleSiteCreated}
        />
      </div>

      {/* Sites Grid */}
      {sites.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <FolderOpen className="size-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No sites yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create your first site to start managing plots and tracking
              construction jobs across your projects.
            </p>
            <Button
              className="mt-4"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="size-4" />
              Create Site
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => {
            const statusConfig = getSiteStatusConfig(site.status);
            const totalJobs =
              site.jobStatusSummary.NOT_STARTED +
              site.jobStatusSummary.IN_PROGRESS +
              site.jobStatusSummary.ON_HOLD +
              site.jobStatusSummary.COMPLETED;

            return (
              <Card
                key={site.id}
                className="group cursor-pointer overflow-hidden border-border/50 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                onClick={() => goToSite(site.id)}
                // (May 2026 a11y audit #126) Pre-fix the card was a
                // div-with-onClick — no keyboard activation, no
                // screen-reader role. Adding role="link" + tabIndex
                // makes it Tab-reachable; Enter/Space activate the
                // navigation. (Full <Link> wrapping would require
                // restructuring the inner Delete button which uses
                // stopPropagation — minimal fix preferred.)
                role="link"
                tabIndex={0}
                aria-label={`Open site ${site.name}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    goToSite(site.id);
                  }
                }}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate">
                        {site.name}
                      </CardTitle>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.className}`}
                      >
                        {statusConfig.label}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDelete(site);
                        }}
                        className="rounded-md p-1 text-muted-foreground opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                        title="Delete site"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  {site.description && (
                    <CardDescription className="line-clamp-2">
                      {site.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Location & Address */}
                  {(site.location || site.address) && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {[site.location, site.address]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </div>
                  )}

                  {/* Plot count & job status dots */}
                  <div className="flex items-center gap-2">
                    <Building2 className="size-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {site._count.plots}{" "}
                      {site._count.plots === 1 ? "plot" : "plots"}
                    </span>
                    {totalJobs > 0 && (
                      <div className="ml-auto flex items-center gap-1">
                        {(
                          Object.entries(site.jobStatusSummary) as [
                            string,
                            number,
                          ][]
                        )
                          .filter(([, count]) => count > 0)
                          .map(([status, count]) => (
                            <div
                              key={status}
                              className="flex items-center gap-1"
                              title={`${status.replace(/_/g, " ")}: ${count}`}
                            >
                              <div
                                className={`size-2 rounded-full ${JOB_STATUS_DOT[status]}`}
                              />
                              <span className="text-xs text-muted-foreground">
                                {count}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Meta info */}
                  <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                    <span>by {site.createdBy.name}</span>
                    <span>
                      {format(new Date(site.createdAt), "d MMM yyyy")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {/* Shared confirm-delete (useConfirmAction) */}
      {confirmDialogs}
    </div>
  );
}
