"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Plus, Building2, MapPin, FolderOpen, Trash2, Loader2 } from "lucide-react";
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
  const [sites, setSites] = useState(initialSites);
  const [dialogOpen, setDialogOpen] = useState(false);

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
        const res = await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
        if (!res.ok) {
          throw new Error(await fetchErrorMessage(res, "Failed to delete site"));
        }
        setSites((prev) => prev.filter((s) => s.id !== site.id));
        toast.success(`${site.name} deleted`);
        router.refresh();
      },
    });
  }

  return (
    <div className="space-y-6">
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
                className="group cursor-pointer overflow-hidden border-border/50 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                onClick={() => router.push(`/sites/${site.id}`)}
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
