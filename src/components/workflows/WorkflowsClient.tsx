"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Plus,
  GitBranch,
  Briefcase,
  CircleDot,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

// ---------- Types ----------

interface JobStatusSummary {
  NOT_STARTED: number;
  IN_PROGRESS: number;
  ON_HOLD: number;
  COMPLETED: number;
}

interface WorkflowItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; email: string };
  _count: { jobs: number };
  jobStatusSummary: JobStatusSummary;
}

// ---------- Helpers ----------

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; dotColor: string }
> = {
  active: {
    label: "Active",
    variant: "default",
    dotColor: "text-green-500",
  },
  completed: {
    label: "Completed",
    variant: "secondary",
    dotColor: "text-blue-500",
  },
  paused: {
    label: "Paused",
    variant: "outline",
    dotColor: "text-amber-500",
  },
};

const JOB_STATUS_DOT: Record<string, string> = {
  NOT_STARTED: "bg-slate-400",
  IN_PROGRESS: "bg-amber-500",
  ON_HOLD: "bg-red-500",
  COMPLETED: "bg-green-500",
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.active;
}

// ---------- Main Component ----------

export function WorkflowsClient({
  workflows: initialWorkflows,
}: {
  workflows: WorkflowItem[];
}) {
  const router = useRouter();
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function handleCreate() {
    if (!name.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create workflow");
      }

      const created = await res.json();

      // Add to local state with defaults
      setWorkflows((prev) => [
        {
          ...created,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
          jobStatusSummary: {
            NOT_STARTED: 0,
            IN_PROGRESS: 0,
            ON_HOLD: 0,
            COMPLETED: 0,
          },
        },
        ...prev,
      ]);

      setName("");
      setDescription("");
      setDialogOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to create workflow:", error);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Manage your construction workflows and programmes
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={<Button />}
          >
            <Plus className="size-4" />
            New Workflow
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Workflow</DialogTitle>
              <DialogDescription>
                Add a new workflow to organise your site jobs.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="workflow-name">Name</Label>
                <Input
                  id="workflow-name"
                  placeholder="e.g. Phase 1 - Groundworks"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workflow-description">Description</Label>
                <Textarea
                  id="workflow-description"
                  placeholder="Brief description of this workflow..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button
                onClick={handleCreate}
                disabled={creating || !name.trim()}
              >
                {creating ? "Creating..." : "Create Workflow"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Workflow Grid */}
      {workflows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <FolderOpen className="size-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No workflows yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create your first workflow to start organising construction jobs
              and tracking progress across your sites.
            </p>
            <Button
              className="mt-4"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="size-4" />
              Create Workflow
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((workflow) => {
            const config = getStatusConfig(workflow.status);
            const totalJobs = workflow._count.jobs;

            return (
              <Card
                key={workflow.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => router.push(`/workflows/${workflow.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate">
                        {workflow.name}
                      </CardTitle>
                    </div>
                    <Badge variant={config.variant}>
                      <CircleDot
                        className={`size-2.5 ${config.dotColor}`}
                      />
                      {config.label}
                    </Badge>
                  </div>
                  {workflow.description && (
                    <CardDescription className="line-clamp-2">
                      {workflow.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Job count & status dots */}
                  <div className="flex items-center gap-2">
                    <Briefcase className="size-3.5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {totalJobs} {totalJobs === 1 ? "job" : "jobs"}
                    </span>
                    {totalJobs > 0 && (
                      <div className="ml-auto flex items-center gap-1">
                        {(
                          Object.entries(workflow.jobStatusSummary) as [
                            string,
                            number,
                          ][]
                        )
                          .filter(([, count]) => count > 0)
                          .map(([status, count]) => (
                            <div
                              key={status}
                              className="flex items-center gap-1"
                              title={`${status.replace("_", " ")}: ${count}`}
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
                    <span>by {workflow.createdBy.name}</span>
                    <span>
                      {format(new Date(workflow.createdAt), "d MMM yyyy")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
